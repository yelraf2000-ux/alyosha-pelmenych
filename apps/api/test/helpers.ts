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
import type { Keyboard } from '../src/services/buyer-bot';
import { SETTING_KEYS } from '../src/services/settings';

const NL = String.fromCharCode(10);

/** What Telegram would send with every update for the tests' bot. */
export const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
/** The chat the tests' shop is run from. */
export const TEST_ADMIN_CHAT = 9000;

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
  sent: {
    orders: string[];
    stockRequests: string[];
    customOrders: string[];
    /** What the Telegram bot wrote, to buyers and to the admin chat. `button` is the first link button, if any. */
    buyer: { chatId: number; text: string; button?: { text: string; url: string }; keyboard?: Keyboard }[];
    /** Messages the bot rewrote and buttons it answered. */
    edits: { chatId: number; messageId: number; text: string; keyboard?: Keyboard }[];
    answers: { text: string; alert: boolean }[];
  };
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

  const sent: TestContext['sent'] = { orders: [], stockRequests: [], customOrders: [], buyer: [], edits: [], answers: [] };
  const notifier: Notifier = {
    orderPlaced: async (order) => void sent.orders.push(order.publicNumber),
    stockRequested: async (request) => void sent.stockRequests.push(request.productName),
    customOrderPlaced: async (order) => void sent.customOrders.push(order.recipeName),
  };

  const uploadsDir = mkdtempSync(join(tmpdir(), 'alyosha-uploads-'));
  const baseOptions: AppOptions = {
    db,
    notifier,
    corsOrigin: 'http://localhost:5173',
    admin: TEST_ADMIN,
    buyerBot: {
      username: 'test_shop_bot',
      webhookSecret: TEST_WEBHOOK_SECRET,
      adminChatIds: [TEST_ADMIN_CHAT],
      adminUrl: 'https://shop.test/admin',
      send: async (chatId, text, keyboard) => {
        const first = keyboard?.[0]?.[0];
        sent.buyer.push({ chatId, text, button: first && 'url' in first ? first : undefined, keyboard });
      },
      edit: async (chatId, messageId, text, keyboard) => void sent.edits.push({ chatId, messageId, text, keyboard }),
      answer: async (_id, text, alert = false) => void sent.answers.push({ text, alert }),
    },
    uploadsDir,
    rateLimit: false,
    logger: false,
  };
  const extraApps: FastifyInstance[] = [];
  const app = await buildApp(baseOptions);

  async function reset() {
    await db.execute(
      sql`TRUNCATE order_items, orders, custom_orders, stock_requests, products, settings RESTART IDENTITY CASCADE`,
    );
    await db.execute(sql`ALTER SEQUENCE order_number_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE custom_order_number_seq RESTART WITH 1`);
    // The base categories come from the migration; whatever a test added goes.
    await db.execute(sql`DELETE FROM categories WHERE slug NOT IN ('pelmeni', 'vareniki', 'manty', 'khinkali', 'other')`);
    await db.insert(settings).values([
      { key: SETTING_KEYS.courierFeeAmd, value: '1000' },
      { key: SETTING_KEYS.freeDeliveryFromAmd, value: '10000' },
      // «Свой рецепт»: a short menu of the tests' own.
      { key: SETTING_KEYS.customBases, value: 'Говядина' + NL + 'Куриное бедро' },
      { key: SETTING_KEYS.customModifiers, value: 'Сливки' + NL + 'Чеснок' + NL + 'Креветка' },
      { key: SETTING_KEYS.customSpices, value: 'Без соли' + NL + 'Паприка' },
    ]);
    sent.orders.length = 0;
    sent.stockRequests.length = 0;
    sent.customOrders.length = 0;
    sent.buyer.length = 0;
    sent.edits.length = 0;
    sent.answers.length = 0;
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
