import bcrypt from 'bcryptjs';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { DEV_ADMIN_PASSWORD, type AdminAuth } from './auth';
import { createDb } from './db/client';
import { loadEnv } from './env';
import { consoleNotifier, telegramNotifier } from './notify';
import { adminChatIdsFromEnv, connectBot, telegramApi } from './telegram';

const env = loadEnv();
const production = env.NODE_ENV === 'production';

const admin: AdminAuth | null =
  env.ADMIN_PASSWORD_HASH && env.SESSION_SECRET
    ? {
        passwordHash: env.ADMIN_PASSWORD_HASH,
        sessionSecret: env.SESSION_SECRET,
        secureCookie: env.PUBLIC_BASE_URL.startsWith('https://'),
      }
    : null;

// A live shop must not run with the development login from .env.example.
if (production) {
  if (!admin) throw new Error('ADMIN_PASSWORD_HASH and SESSION_SECRET are required in production.');
  if (admin.sessionSecret.startsWith('dev-only')) {
    throw new Error('SESSION_SECRET is still the development value. Generate a new one.');
  }
  if (await bcrypt.compare(DEV_ADMIN_PASSWORD, admin.passwordHash)) {
    throw new Error('The admin password is still the development one. Run `npm run admin:password`.');
  }
}

const { db, pool } = createDb(env.DATABASE_URL);

// The notifier needs the app's logger, and the app needs the notifier: hand the app a thin proxy.
let notifier: ReturnType<typeof consoleNotifier>;

// The same goes for the bot that talks to buyers: it is connected before the app exists (the app
// needs the bot's username), so until then its few lines go to the console.
type BotLog = Parameters<typeof telegramApi>[1] extends () => infer L ? L : never;
let botLog: BotLog = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (obj, msg) => console.error(msg, obj),
};
// Every chat named in TELEGRAM_CHAT_ID (and in TELEGRAM_CHAT_ID2 and the like) is an admin chat.
const adminChatIds = adminChatIdsFromEnv();
const telegram = env.TELEGRAM_BOT_TOKEN ? telegramApi(env.TELEGRAM_BOT_TOKEN, () => botLog) : null;
const buyerBot =
  telegram && env.TELEGRAM_BOT_TOKEN
    ? await connectBot(telegram, env.TELEGRAM_BOT_TOKEN, env.PUBLIC_BASE_URL, adminChatIds, () => botLog)
    : null;

const app = await buildApp({
  db,
  admin,
  buyerBot,
  corsOrigin: env.PUBLIC_BASE_URL,
  uploadsDir: resolve(env.UPLOADS_DIR),
  webDir: env.WEB_DIST_DIR ? resolve(env.WEB_DIST_DIR) : undefined,
  trustProxy: env.TRUST_PROXY,
  notifier: {
    orderPlaced: (order) => notifier.orderPlaced(order),
    stockRequested: (request) => notifier.stockRequested(request),
    customOrderPlaced: (order) => notifier.customOrderPlaced(order),
  },
});

botLog = {
  info: (msg) => app.log.info(msg),
  warn: (msg) => app.log.warn(msg),
  error: (obj, msg) => app.log.error(obj, msg),
};

if (telegram && adminChatIds.length > 0) {
  // Buttons under the orders need the bot's webhook; without it the same messages come plain.
  notifier = telegramNotifier(telegram.send, adminChatIds, { buttons: buyerBot !== null, adminUrl: buyerBot?.adminUrl ?? null });
} else {
  notifier = consoleNotifier(app.log);
  app.log.warn('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set: notifications are only printed here.');
}
if (telegram && adminChatIds.length > 0) {
  app.log.info(`Telegram admin chats: ${adminChatIds.length}.`);
}
if (!admin) {
  app.log.warn('ADMIN_PASSWORD_HASH / SESSION_SECRET are not set: the admin panel is switched off.');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => pool.end());
  });
}

await app.listen({ port: env.PORT, host: '0.0.0.0' });
