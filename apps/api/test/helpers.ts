import 'dotenv/config';
import type { OrderInput } from '@alyosha/shared';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type AppOptions } from '../src/app';
import { createSessionToken, SESSION_COOKIE, type AdminAuth } from '../src/auth';
import { createDb, type Db } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { products, settings } from '../src/db/schema';
import type { Notifier } from '../src/notify';
import { SETTING_KEYS } from '../src/services/settings';

export const TEST_ADMIN_PASSWORD = 'test-admin-password';

export const TEST_ADMIN: AdminAuth = {
  // Cost 4 keeps the tests fast; production hashes use 12.
  passwordHash: bcrypt.hashSync(TEST_ADMIN_PASSWORD, 4),
  sessionSecret: 'test-session-secret-0123456789abcdef',
  secureCookie: false,
};

/** Cookie header of a signed-in admin. */
export function adminCookie(auth: AdminAuth = TEST_ADMIN, now?: number): string {
  return `${SESSION_COOKIE}=${createSessionToken(auth, now)}`;
}

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  uploadsDir: string;
  /** A second app on the same database, e.g. with rate limits on or the admin switched off. */
  buildApp: (overrides: Partial<AppOptions>) => Promise<FastifyInstance>;
  /** Everything the app tried to send to the owner. */
  sent: { orders: string[]; stockRequests: string[] };
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('DATABASE_URL_TEST is not set. Run `npm run db:start` and see apps/api/.env.example.');
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL_TEST must not be the dev database: the tests empty every table.');
  }

  await runMigrations(url);
  const { db, pool } = createDb(url);

  const sent: TestContext['sent'] = { orders: [], stockRequests: [] };
  const notifier: Notifier = {
    orderPlaced: async (order) => void sent.orders.push(order.publicNumber),
    stockRequested: async (request) => void sent.stockRequests.push(request.productName),
  };

  const uploadsDir = mkdtempSync(join(tmpdir(), 'alyosha-uploads-'));
  const baseOptions: AppOptions = {
    db,
    notifier,
    corsOrigin: 'http://localhost:5173',
    admin: TEST_ADMIN,
    uploadsDir,
    rateLimit: false,
    logger: false,
  };
  const extraApps: FastifyInstance[] = [];
  const app = await buildApp(baseOptions);

  async function reset() {
    await db.execute(
      sql`TRUNCATE order_items, orders, stock_requests, products, settings RESTART IDENTITY CASCADE`,
    );
    await db.execute(sql`ALTER SEQUENCE order_number_seq RESTART WITH 1`);
    // The base categories come from the migration; whatever a test added goes.
    await db.execute(sql`DELETE FROM categories WHERE slug NOT IN ('pelmeni', 'vareniki', 'manty', 'khinkali', 'other')`);
    await db.insert(settings).values([
      { key: SETTING_KEYS.courierFeeAmd, value: '1000' },
      { key: SETTING_KEYS.freeDeliveryFromAmd, value: '10000' },
    ]);
    sent.orders.length = 0;
    sent.stockRequests.length = 0;
  }

  return {
    app,
    db,
    uploadsDir,
    sent,
    reset,
    buildApp: async (overrides) => {
      const extra = await buildApp({ ...baseOptions, ...overrides });
      extraApps.push(extra);
      return extra;
    },
    close: async () => {
      await Promise.all([app, ...extraApps].map((instance) => instance.close()));
      await pool.end();
      rmSync(uploadsDir, { recursive: true, force: true });
    },
  };
}

let slugCounter = 0;

export async function addProduct(db: Db, values: Partial<typeof products.$inferInsert> = {}): Promise<number> {
  slugCounter += 1;
  const [row] = await db
    .insert(products)
    .values({
      slug: `product-${slugCounter}`,
      name: `Товар ${slugCounter}`,
      category: 'pelmeni',
      priceAmd: 2000,
      weightLabel: '500 г',
      stockQty: 10,
      ...values,
    })
    .returning({ id: products.id });
  return row!.id;
}

export async function stockOf(db: Db, productId: number): Promise<number> {
  const result = await db.execute<{ stock_qty: number }>(sql`SELECT stock_qty FROM products WHERE id = ${productId}`);
  return result.rows[0]!.stock_qty;
}

export async function countRows(db: Db, table: 'orders' | 'order_items' | 'stock_requests'): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`);
  return result.rows[0]!.n;
}

export function orderBody(items: OrderInput['items'], overrides: Partial<OrderInput> = {}): OrderInput {
  return {
    customerName: 'Тест',
    customerPhone: '+374 91 123456',
    customerTelegram: null,
    comment: null,
    deliveryMethod: 'pickup',
    deliveryAddress: null,
    website: '',
    items,
    ...overrides,
  };
}

export function postOrder(app: FastifyInstance, body: unknown) {
  return app.inject({ method: 'POST', url: '/api/orders', payload: body as object });
}
