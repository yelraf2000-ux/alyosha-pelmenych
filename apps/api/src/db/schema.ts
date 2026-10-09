import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Data model from SPEC §5. Money is whole AMD, stored as integers.

export const deliveryMethod = pgEnum('delivery_method', ['pickup', 'courier']);
export const orderStatus = pgEnum('order_status', ['new', 'confirmed', 'done', 'cancelled']);
export const stockRequestStatus = pgEnum('stock_request_status', ['open', 'notified', 'closed']);

/** Feeds the human-friendly order number: A-0001, A-0002, … */
export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 1, increment: 1 });
export const customOrderNumberSeq = pgSequence('custom_order_number_seq', { startWith: 1, increment: 1 });

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * How the shop's Telegram bot reaches the buyer of an order (services/buyer-bot.ts).
 * `notifyToken` is the secret in the link on the thank-you page; `telegramChatId` is filled in
 * when the buyer follows it and presses Start. Orders placed before the bot existed have neither.
 */
const buyerChat = (table: string) => ({
  // Named after its table: the two unique constraints must not share a name.
  notifyToken: text('notify_token').unique(`${table}_notify_token_unique`),
  telegramChatId: bigint('telegram_chat_id', { mode: 'number' }),
});

/** The groups of the catalog. The owner adds them in the admin; products refer to `slug`. */
export const categories = pgTable('categories', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    category: text('category')
      .notNull()
      .references(() => categories.slug, { onUpdate: 'cascade' }),
    priceAmd: integer('price_amd').notNull(),
    weightLabel: text('weight_label').notNull().default(''),
    stockQty: integer('stock_qty').notNull().default(0),
    isNew: boolean('is_new').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    imagePath: text('image_path'),
    videoPath: text('video_path'),
    ...timestamps,
  },
  (t) => [
    // The database itself refuses to oversell, whatever the application code does.
    check('products_stock_qty_non_negative', sql`${t.stockQty} >= 0`),
    check('products_price_amd_non_negative', sql`${t.priceAmd} >= 0`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    publicNumber: text('public_number')
      .notNull()
      .unique()
      .default(sql`'A-' || lpad(nextval('order_number_seq')::text, 4, '0')`),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerTelegram: text('customer_telegram'),
    comment: text('comment'),
    deliveryMethod: deliveryMethod('delivery_method').notNull(),
    deliveryAddress: text('delivery_address'),
    itemsTotalAmd: integer('items_total_amd').notNull(),
    deliveryFeeAmd: integer('delivery_fee_amd').notNull(),
    /** True when the courier is paid separately, on top of `totalAmd` (no fixed fee in the settings). */
    deliveryExtra: boolean('delivery_extra').notNull().default(false),
    totalAmd: integer('total_amd').notNull(),
    status: orderStatus('status').notNull().default('new'),
    ...buyerChat('orders'),
    ...timestamps,
  },
  (t) => [
    check('orders_courier_has_address', sql`${t.deliveryMethod} <> 'courier' OR ${t.deliveryAddress} IS NOT NULL`),
    index('orders_status_created_idx').on(t.status, t.createdAt),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    // Name and price are copied at order time, so later edits don't rewrite history.
    productNameSnapshot: text('product_name_snapshot').notNull(),
    priceAmdSnapshot: integer('price_amd_snapshot').notNull(),
    qty: integer('qty').notNull(),
  },
  (t) => [check('order_items_qty_positive', sql`${t.qty} > 0`), index('order_items_order_idx').on(t.orderId)],
);

export const stockRequests = pgTable(
  'stock_requests',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    telegram: text('telegram'),
    status: stockRequestStatus('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stock_requests_product_status_idx').on(t.productId, t.status)],
);

/** Key/value site settings, edited in the admin (Phase 2). Keys are listed in services/settings.ts. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/**
 * «Свой рецепт»: пельмени made to a buyer's own recipe. A request rather than an order: there is
 * no price and no stock behind it, the owner calls back to agree both. The chosen options are
 * stored as the buyer read them, so later edits of the lists in the settings do not rewrite them.
 */
export const customOrders = pgTable(
  'custom_orders',
  {
    id: serial('id').primaryKey(),
    publicNumber: text('public_number')
      .notNull()
      .unique()
      .default(sql`'R-' || lpad(nextval('custom_order_number_seq')::text, 4, '0')`),
    recipeName: text('recipe_name').notNull(),
    base: text('base').notNull(),
    modifiers: text('modifiers').array().notNull(),
    spices: text('spices').array().notNull(),
    weightGrams: integer('weight_grams').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerTelegram: text('customer_telegram'),
    comment: text('comment'),
    status: orderStatus('status').notNull().default('new'),
    ...buyerChat('custom_orders'),
    ...timestamps,
  },
  (t) => [index('custom_orders_status_created_idx').on(t.status, t.createdAt)],
);

/**
 * The admin password when the owner has set it through the bot, and the link that lets him
 * (services/admin-password.ts). One row at most. Nothing here can be turned back into a password
 * or into a working link: both are stored as hashes.
 */
export const adminPassword = pgTable(
  'admin_password',
  {
    id: integer('id').primaryKey().default(1),
    passwordHash: text('password_hash'),
    /** Which ADMIN_PASSWORD_HASH this password was set under; it is void under any other. */
    configuredFingerprint: text('configured_fingerprint'),
    resetTokenHash: text('reset_token_hash'),
    resetExpiresAt: timestamp('reset_expires_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('admin_password_single_row', sql`${t.id} = 1`)],
);
