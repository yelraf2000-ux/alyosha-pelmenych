import 'dotenv/config';
import type { Settings } from '@alyosha/shared';
import { count } from 'drizzle-orm';
import { SETTING_KEYS } from '../services/settings';
import { createDb } from './client';
import { products, settings } from './schema';

// Seed data (SPEC §9): three sample products and the site settings.
// TODO_CLIENT: every text, price and stock number here is a placeholder and is listed in TODO_CLIENT.md.
// Stock is chosen so each card state is visible: in stock, low stock (≤ 3), out of stock.

const PLACEHOLDER_DESCRIPTION =
  'PLACEHOLDER: здесь будет описание — состав, вкус, как готовить. Текст пришлёт Алексей.';

const SEED_PRODUCTS: (typeof products.$inferInsert)[] = [
  {
    slug: 'pelmeni-domashnie',
    name: 'Пельмени домашние', // TODO_CLIENT
    description: PLACEHOLDER_DESCRIPTION,
    category: 'pelmeni',
    priceAmd: 2400, // TODO_CLIENT
    weightLabel: '500 г', // TODO_CLIENT
    stockQty: 12,
    sortOrder: 10,
  },
  {
    slug: 'vareniki-s-kartoshkoy',
    name: 'Вареники с картошкой', // TODO_CLIENT
    description: PLACEHOLDER_DESCRIPTION,
    category: 'vareniki',
    priceAmd: 1800, // TODO_CLIENT
    weightLabel: '500 г', // TODO_CLIENT
    stockQty: 3,
    isNew: true,
    sortOrder: 20,
  },
  {
    slug: 'manty',
    name: 'Манты', // TODO_CLIENT
    description: PLACEHOLDER_DESCRIPTION,
    category: 'manty',
    priceAmd: 3200, // TODO_CLIENT
    weightLabel: '800 г', // TODO_CLIENT
    stockQty: 0,
    isNew: true,
    sortOrder: 30,
  },
];

const SEED_SETTINGS: Settings = {
  heroTitle: 'Домашние пельмени ручной лепки', // TODO_CLIENT
  heroSubtitle: 'Пельмени, вареники и манты. Лепим в Ереване, привозим замороженными.', // TODO_CLIENT
  aboutText:
    'PLACEHOLDER: здесь будет рассказ о вас — кто лепит, из чего и почему это вкусно.\n\n' +
    'PLACEHOLDER: второй абзац — два-три предложения о том, как всё начиналось.',
  deliveryText:
    'PLACEHOLDER: здесь будут условия доставки и оплаты — как и когда привозим, как можно оплатить заказ.\n\n' +
    'После оформления заказа мы сами свяжемся с вами и уточним детали.',
  contactsText: 'PLACEHOLDER: когда вам удобнее писать и звонить, часы работы.',
  pickupAddress: 'PLACEHOLDER: адрес самовывоза, Ереван', // TODO_CLIENT
  courierFeeAmd: 1000, // TODO_CLIENT
  freeDeliveryFromAmd: 10000, // TODO_CLIENT
  deliveryNote: 'Заказы после 15:00 — на следующий день', // TODO_CLIENT (example from SPEC)
  phonePublic: '+374 00 000000', // TODO_CLIENT
  telegramPublic: 'TODO_CLIENT', // TODO_CLIENT: username without @
  instagramUrl: 'https://instagram.com/TODO_CLIENT', // TODO_CLIENT
};

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. See apps/api/.env.example.');

// With --if-empty the seed only fills a brand-new database. Hosts without a shell (Render) run it
// on every start, and it must not bring back placeholder products the owner has deleted.
const onlyIfEmpty = process.argv.includes('--if-empty');

const { db, pool } = createDb(url);
try {
  if (onlyIfEmpty) {
    const [existing] = await db.select({ n: count() }).from(settings);
    if (existing && existing.n > 0) {
      console.log('The database already has data: nothing seeded.');
      process.exit(0);
    }
  }

  // Safe to run again: existing products and settings are left as they are.
  const insertedProducts = await db
    .insert(products)
    .values(SEED_PRODUCTS)
    .onConflictDoNothing({ target: products.slug })
    .returning({ id: products.id });

  const insertedSettings = await db
    .insert(settings)
    .values(
      (Object.keys(SETTING_KEYS) as (keyof Settings)[]).map((field) => ({
        key: SETTING_KEYS[field],
        value: String(SEED_SETTINGS[field]),
      })),
    )
    .onConflictDoNothing({ target: settings.key })
    .returning({ key: settings.key });

  console.log(`Seeded ${insertedProducts.length} products and ${insertedSettings.length} settings.`);
} finally {
  await pool.end();
}
