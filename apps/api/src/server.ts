import bcrypt from 'bcryptjs';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { DEV_ADMIN_PASSWORD, type AdminAuth } from './auth';
import { createDb } from './db/client';
import { loadEnv } from './env';
import { consoleNotifier, telegramNotifier } from './notify';

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

const app = await buildApp({
  db,
  admin,
  corsOrigin: env.PUBLIC_BASE_URL,
  uploadsDir: resolve(env.UPLOADS_DIR),
  webDir: env.WEB_DIST_DIR ? resolve(env.WEB_DIST_DIR) : undefined,
  trustProxy: env.TRUST_PROXY,
  notifier: {
    orderPlaced: (order, customer) => notifier.orderPlaced(order, customer),
    stockRequested: (request) => notifier.stockRequested(request),
  },
});

if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
  notifier = telegramNotifier(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, app.log);
} else {
  notifier = consoleNotifier(app.log);
  app.log.warn('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set: notifications are only printed here.');
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
