import { orderInputSchema, stockRequestSchema, type Product, type SubmitOrderResult } from '@alyosha/shared';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { asc, eq } from 'drizzle-orm';
import Fastify, { type FastifyContextConfig, type FastifyInstance } from 'fastify';
import { mkdirSync } from 'node:fs';
import { registerAdminRoutes } from './admin-routes';
import type { AdminAuth } from './auth';
import type { Db } from './db/client';
import { products, stockRequests } from './db/schema';
import type { Notifier } from './notify';
import { placeOrder } from './services/orders';
import { toProduct } from './services/products';
import { getSettings } from './services/settings';

export interface AppOptions {
  db: Db;
  notifier: Notifier;
  /** Origin of the storefront; the only origin allowed by CORS. */
  corsOrigin: string;
  /** Admin login. Without it the admin API answers 503. */
  admin?: AdminAuth | null;
  /** Folder for uploaded product photos, served at /uploads. */
  uploadsDir: string;
  /**
   * Folder with the built storefront. When set, the API serves the site as well, for hosts that
   * run a single container (Render). With Docker Compose this is unset and Caddy serves the site.
   */
  webDir?: string;
  /** Off in tests, which fire many requests from one address on purpose. */
  rateLimit?: boolean;
  trustProxy?: boolean;
  logger?: boolean;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { db, notifier } = options;
  const limits = options.rateLimit ?? true;

  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: options.trustProxy ?? false,
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet, {
    // The same policy as deploy/Caddyfile. It matters when the API also serves the storefront;
    // for JSON answers it changes nothing.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
        mediaSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(cors, { origin: options.corsOrigin, methods: ['GET', 'POST'] });
  await app.register(rateLimit, { global: false });
  await app.register(cookie);

  // Uploaded photos have random, never-reused names, so browsers may keep them for a year.
  mkdirSync(options.uploadsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: options.uploadsDir,
    prefix: '/uploads/',
    index: false,
    maxAge: '365d',
    immutable: true,
  });

  const limit = (max: number, timeWindow = '10 minutes'): FastifyContextConfig => ({
    rateLimit: limits ? { max, timeWindow } : false,
  });

  // Set before any routes are registered: plugins registered later copy the handler that exists
  // at that moment. The storefront shows «Слишком много попыток» for 429.
  app.setErrorHandler((error: { statusCode?: number }, request, reply) => {
    if (error.statusCode === 429) {
      return reply.code(429).send({ ok: false, error: 'rate_limited' });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ ok: false, error: 'invalid' });
    }
    request.log.error(error);
    return reply.code(500).send({ ok: false, error: 'server_error' });
  });

  await registerAdminRoutes(app, {
    db,
    auth: options.admin ?? null,
    origin: options.corsOrigin,
    uploadsDir: options.uploadsDir,
    // SPEC §7: login rate limit.
    loginLimit: limit(5, '15 minutes'),
  });

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/products', async (): Promise<Product[]> => {
    const rows = await db
      .select()
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.sortOrder), asc(products.id));
    return rows.map(toProduct);
  });

  app.get('/api/settings', async () => getSettings(db));

  app.post('/api/orders', { config: limit(10) }, async (request, reply): Promise<SubmitOrderResult> => {
    const parsed = orderInputSchema.safeParse(request.body);
    if (!parsed.success) {
      // Includes a filled honeypot field.
      reply.code(400);
      return { ok: false, error: 'invalid' };
    }

    const result = await placeOrder(db, parsed.data);
    if (!result.ok) {
      reply.code(409);
      return result;
    }

    // After commit, and not awaited: a slow or failing Telegram must not delay or fail the order.
    void notifier.orderPlaced(result.order, result.customer);

    reply.code(201);
    return { ok: true, order: result.order };
  });

  app.post('/api/stock-requests', { config: limit(20) }, async (request, reply) => {
    const parsed = stockRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'invalid' };
    }

    const [product] = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.id, parsed.data.productId));
    if (!product) {
      reply.code(404);
      return { ok: false, error: 'not_found' };
    }

    await db.insert(stockRequests).values({
      productId: product.id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      telegram: parsed.data.telegram,
    });

    void notifier.stockRequested({
      productName: product.name,
      name: parsed.data.name,
      phone: parsed.data.phone,
      telegram: parsed.data.telegram,
    });

    reply.code(201);
    return { ok: true };
  });

  if (options.webDir) {
    const webDir = options.webDir;

    await app.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      // reply.sendFile() already exists from the uploads registration above.
      decorateReply: false,
      setHeaders(reply, filePath) {
        const path = filePath.replaceAll('\\', '/');
        // Vite puts a content hash into every file name under /assets, so those never change.
        if (path.includes('/assets/')) reply.header('cache-control', 'public, max-age=31536000, immutable');
        else reply.header('cache-control', 'no-cache');
      },
    });

    // Client-side routes (/catalog, /admin/orders, …) have no file: they all get index.html.
    app.setNotFoundHandler((request, reply) => {
      const isPage =
        (request.method === 'GET' || request.method === 'HEAD') &&
        !request.url.startsWith('/api/') &&
        !request.url.startsWith('/uploads/');
      if (!isPage) return reply.code(404).send({ ok: false, error: 'not_found' });
      return reply.header('cache-control', 'no-cache').sendFile('index.html', webDir, { cacheControl: false });
    });
  }

  return app;
}
