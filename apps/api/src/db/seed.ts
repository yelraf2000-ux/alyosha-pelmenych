import 'dotenv/config';
import type { Settings } from '@alyosha/shared';
import { count } from 'drizzle-orm';
import { SETTING_KEYS } from '../services/settings';
import { createDb } from './client';
import { products, settings } from './schema';

// What a brand-new database starts with: the assortment and contacts Алексей sent
// (price list and messages of 8 Oct 2026). He edits all of it in the admin afterwards.
// What is still a guess is marked TODO_CLIENT and listed in TODO_CLIENT.md.

type SeedProduct = Pick<typeof products.$inferInsert, 'slug' | 'name' | 'category' | 'priceAmd' | 'weightLabel'>;

// Names, pack sizes and prices are from the price list.
const PRICE_LIST: SeedProduct[] = [
  { slug: 'pelmeni-kurinye-iz-bedra', name: 'Пельмени куриные из бедра', category: 'pelmeni', priceAmd: 2300, weightLabel: '500 г' },
  { slug: 'pelmeni-kurinye-slivochno-syrnye', name: 'Пельмени куриные сливочно-сырные', category: 'pelmeni', priceAmd: 2700, weightLabel: '500 г' },
  { slug: 'pelmeni-kurinye-s-krevetkoy', name: 'Пельмени куриные с креветкой', category: 'pelmeni', priceAmd: 3500, weightLabel: '500 г' },
  { slug: 'pelmeni-govyazhi', name: 'Пельмени говяжьи', category: 'pelmeni', priceAmd: 3300, weightLabel: '500 г' },
  { slug: 'pelmeni-govyazhi-s-zelenyu', name: 'Пельмени говяжьи с зеленью', category: 'pelmeni', priceAmd: 3400, weightLabel: '500 г' },
  { slug: 'manty-kurinye', name: 'Манты куриные', category: 'manty', priceAmd: 2000, weightLabel: '6 шт.' },
  { slug: 'manty-govyazhi', name: 'Манты говяжьи', category: 'manty', priceAmd: 2500, weightLabel: '6 шт.' },
  { slug: 'hinkali-govyazhi', name: 'Хинкали говяжьи', category: 'khinkali', priceAmd: 3300, weightLabel: '6 шт.' },
  { slug: 'hinkali-svino-govyazhi', name: 'Хинкали свино-говяжьи', category: 'khinkali', priceAmd: 3000, weightLabel: '6 шт.' },
];

const SEED_PRODUCTS: (typeof products.$inferInsert)[] = PRICE_LIST.map((product, index) => ({
  ...product,
  // Алексей will write the compositions himself; the product page hides an empty description.
  description: '',
  // The picture built by scripts/product-art/build.mjs, until he uploads a real photo.
  imagePath: `/products/${product.slug}-1000.webp`,
  // TODO_CLIENT: not a real count. He sets the real stock in the admin before the shop opens.
  stockQty: 10,
  sortOrder: (index + 1) * 10,
}));

const SEED_SETTINGS: Settings = {
  heroTitle: 'Домашние пельмени ручной лепки', // TODO_CLIENT: our wording, to be approved
  heroSubtitle: 'Пельмени, манты и хинкали. Лепим в Ереване.', // TODO_CLIENT: our wording, to be approved
  aboutText:
    'PLACEHOLDER: здесь будет рассказ о вас — кто лепит, из чего и почему это вкусно.\n\n' +
    'PLACEHOLDER: второй абзац — два-три предложения о том, как всё начиналось.', // TODO_CLIENT
  // The pickup address and delivery prices are shown from their own settings, above this text.
  // TODO_CLIENT: how buyers pay is not known yet.
  deliveryText: 'После оформления заказа мы сами свяжемся с вами и уточним детали.',
  contactsText: 'Работаем каждый день с 11:00 до 22:00, без выходных.',
  pickupAddress: 'Ереван, проспект Тигран Мец, 59',
  courierFeeAmd: 1000, // TODO_CLIENT: he gave only the free threshold, not the fee below it
  freeDeliveryFromAmd: 20000,
  deliveryNote: '',
  phonePublic: '+374 55 443639',
  telegramPublic: 'apelmenych', // his Telegram channel
  instagramUrl: 'https://www.instagram.com/bbllbbd',
  tiktokUrl: 'https://www.tiktok.com/@bbllbbd',
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
