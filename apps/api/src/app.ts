import {
  customOrderSchema,
  orderInputSchema,
  stockRequestSchema,
  type Product,
  type SubmitCustomOrderResult,
  type SubmitOrderResult,
} from '@alyosha/shared';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { asc, eq } from 'drizzle-orm';
import Fastify, { type FastifyContextConfig, type FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { registerAdminRoutes } from './admin-routes';
import type { AdminAuth } from './auth';
import type { Db } from './db/client';
import { products, stockRequests } from './db/schema';
import type { Notifier } from './notify';
import { ADMIN_HELP_TEXT, handleAdminCallback, isAdminChat, sendOpenOrders } from './services/admin-bot';
import { getOrder } from './services/admin-orders';
import { placeOrder } from './services/orders';
import { toProduct } from './services/products';
import { listCategories } from './services/categories';
import {
  chatIdText,
  contactButton,
  customLinkedText,
  linkChat,
  orderBotLink,
  orderLinkedText,
  UNKNOWN_ORDER_TEXT,
  WELCOME_TEXT,
  type BuyerBot,
} from './services/buyer-bot';
import { placeCustomOrder } from './services/custom-orders';
import { getSettings } from './services/settings';

export interface AppOptions {
  db: Db;
  notifier: Notifier;
  /** Origin of the storefront; the only origin allowed by CORS. */
  corsOrigin: string;
  /** Admin login. Without it the admin API answers 503. */
  admin?: AdminAuth | null;
  /** The Telegram bot that tells buyers about their orders. Without it they get no link to it. */
  buyerBot?: BuyerBot | null;
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
  const buyerBot = options.buyerBot ?? null;
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
    buyerBot,
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

  app.get('/api/categories', async () => listCategories(db));

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
    void getOrder(db, result.id).then((placed) => placed && notifier.orderPlaced(placed));

    reply.code(201);
    return { ok: true, order: { ...result.order, telegramLink: orderBotLink(buyerBot, result.notifyToken, 'order') } };
  });

  // «Свой рецепт»: a request for пельмени to the buyer's own recipe. No price, no stock: the owner calls back.
  app.post('/api/custom-orders', { config: limit(10) }, async (request, reply): Promise<SubmitCustomOrderResult> => {
    const parsed = customOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'invalid' };
    }
    const result = await placeCustomOrder(db, parsed.data);
    if (!result.ok) {
      reply.code(result.error === 'unavailable' ? 409 : 400);
      return result;
    }
    void notifier.customOrderPlaced(result.order);
    reply.code(201);
    return { ok: true, telegramLink: orderBotLink(buyerBot, result.notifyToken, 'custom') };
  });

  // Telegram calls this for every message sent to the bot and every button pressed in it.
  // A buyer who followed the link from the thank-you page arrives as «/start <token>»: from then on
  // the bot may write to them about that order. The admin chats run the shop from here.
  app.post('/api/telegram/webhook', { config: limit(600, '1 minute') }, async (request, reply) => {
    if (!buyerBot) {
      reply.code(404);
      return { ok: false, error: 'not_found' };
    }
    const given = Buffer.from(String(request.headers['x-telegram-bot-api-secret-token'] ?? ''));
    const expected = Buffer.from(buyerBot.webhookSecret);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      reply.code(403);
      return { ok: false, error: 'forbidden' };
    }

    const update = request.body as {
      message?: { text?: unknown; chat?: { id?: unknown; type?: unknown } };
      callback_query?: Parameters<typeof handleAdminCallback>[2];
    } | null;

    // A button under an order in an admin chat.
    if (update?.callback_query) {
      await handleAdminCallback(db, buyerBot, update.callback_query);
      return { ok: true };
    }

    const message = update?.message;
    const chatId = message?.chat?.id;
    const text = message?.text;
    if (typeof chatId !== 'number' || typeof text !== 'string') return { ok: true };
    // «/orders», or «/orders@our_bot» as Telegram writes it in a group.
    const command = (name: string) => new RegExp(`^/${name}(?:@[A-Za-z0-9_]+)?[ ]*$`).test(text);

    // The one thing the bot answers anywhere, a group included: the number of the chat. The owner
    // needs it once for TELEGRAM_CHAT_ID, and a group is where two people can both see the orders.
    if (command('chatid')) {
      void buyerBot.send(chatId, chatIdText(chatId));
      return { ok: true };
    }

    // The admin chats (a group too) run the shop from here.
    if (isAdminChat(buyerBot, chatId)) {
      if (command('orders')) {
        await sendOpenOrders(db, buyerBot, chatId);
        return { ok: true };
      }
      if (command('start') || command('help')) {
        void buyerBot.send(chatId, ADMIN_HELP_TEXT);
        return { ok: true };
      }
    }

    // Everything else is for buyers, and only in a private chat.
    if (message?.chat?.type !== 'private') return { ok: true };

    const button = contactButton(await getSettings(db));
    const start = /^[/]start(?:@[A-Za-z0-9_]+)?(?:[ ]+([^ ]+))?[ ]*$/.exec(text);
    if (start?.[1]) {
      const linked = await linkChat(db, start[1], chatId);
      if (!linked) void buyerBot.send(chatId, UNKNOWN_ORDER_TEXT, button);
      else if (linked.kind === 'order') void buyerBot.send(chatId, orderLinkedText(linked.order), button);
      else void buyerBot.send(chatId, customLinkedText(linked.order), button);
    } else {
      void buyerBot.send(chatId, WELCOME_TEXT, button);
    }
    // Always 200: anything else makes Telegram send the same update again and again.
    return { ok: true };
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
