import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Data model from SPEC §5. Money is whole AMD, stored as integers.

export const deliveryMethod = pgEnum('delivery_method', ['pickup', 'courier']);
export const orderStatus = pgEnum('order_status', ['new', 'confirmed', 'done', 'cancelled']);
export const promoKind = pgEnum('promo_kind', ['percent', 'amount']);
/** What an ingredient on the warehouse is counted in: grams, millilitres or pieces. */
export const ingredientUnit = pgEnum('ingredient_unit', ['g', 'ml', 'pcs']);

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
    /** The owner's own labels («Бест-селлер»…), shown on the product next to «Новинка». */
    badges: text('badges').array().notNull().default(sql`'{}'::text[]`),
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
    /**
     * The promo code, if any: the link to it for counting its uses, and its text and the discount
     * as they were, which stay when the code itself is deleted.
     */
    promoCodeId: integer('promo_code_id').references(() => promoCodes.id, { onDelete: 'set null' }),
    promoCode: text('promo_code'),
    discountAmd: integer('discount_amd').notNull().default(0),
    /** Some of it is made to order: see `order_items.preorder_qty`. */
    isPreorder: boolean('is_preorder').notNull().default(false),
    status: orderStatus('status').notNull().default('new'),
    ...buyerChat('orders'),
    ...timestamps,
  },
  (t) => [
    check('orders_courier_has_address', sql`${t.deliveryMethod} <> 'courier' OR ${t.deliveryAddress} IS NOT NULL`),
    check('orders_discount_non_negative', sql`${t.discountAmd} >= 0`),
    index('orders_status_created_idx').on(t.status, t.createdAt),
    index('orders_promo_code_idx').on(t.promoCodeId),
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
    /**
     * How many of `qty` were not in stock when the order took them: they are made to order, and
     * only `qty − preorder_qty` came out of the stock (and goes back into it on cancelling).
     */
    preorderQty: integer('preorder_qty').notNull().default(0),
    /**
     * What one of it cost to make when it was ordered (whole AMD), from the product's composition
     * and the warehouse's prices then; null when the product had no composition (and for orders
     * from before the warehouse). Later price or composition changes never rewrite it.
     */
    unitCostAmd: integer('unit_cost_amd'),
    /**
     * The composition of one, as it was taken off the warehouse for this line: exactly this goes
     * back when the order is cancelled, whatever the product's composition is by then.
     */
    ingredients: jsonb('ingredients').$type<IngredientUse[]>(),
  },
  (t) => [
    check('order_items_qty_positive', sql`${t.qty} > 0`),
    check('order_items_preorder_within_qty', sql`${t.preorderQty} >= 0 AND ${t.preorderQty} <= ${t.qty}`),
    index('order_items_order_idx').on(t.orderId),
  ],
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
    /** The price the owner named, once he has; it counts in the statistics. */
    priceAmd: integer('price_amd'),
    /** What the owner says making it cost him; with a price, it gives the request's profit. */
    costAmd: integer('cost_amd'),
    status: orderStatus('status').notNull().default('new'),
    ...buyerChat('custom_orders'),
    ...timestamps,
  },
  (t) => [
    index('custom_orders_status_created_idx').on(t.status, t.createdAt),
    check('custom_orders_price_non_negative', sql`${t.priceAmd} IS NULL OR ${t.priceAmd} >= 0`),
    check('custom_orders_cost_non_negative', sql`${t.costAmd} IS NULL OR ${t.costAmd} >= 0`),
  ],
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

/**
 * The owner's promo codes (services/promo-codes.ts). `code` is kept in upper case, so a buyer may
 * type it either way. How often a code was used is counted from the orders, never stored.
 */
export const promoCodes = pgTable(
  'promo_codes',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    kind: promoKind('kind').notNull(),
    /** Percent (1–100) or whole AMD, by `kind`. */
    value: integer('value').notNull(),
    /** What it works on; both empty: every product. */
    categories: text('categories').array().notNull().default(sql`'{}'::text[]`),
    productIds: integer('product_ids').array().notNull().default(sql`'{}'::integer[]`),
    maxUses: integer('max_uses'),
    /** The last day it works, in the shop's time zone. */
    validUntil: date('valid_until'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check('promo_codes_value_positive', sql`${t.value} > 0`),
    check('promo_codes_percent_at_most_100', sql`${t.kind} <> 'percent' OR ${t.value} <= 100`),
    check('promo_codes_max_uses_positive', sql`${t.maxUses} IS NULL OR ${t.maxUses} > 0`),
  ],
);

/** «Новости»: the owner's posts, newest first by `published_on`. */
export const newsPosts = pgTable(
  'news_posts',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    text: text('text').notNull().default(''),
    imagePath: text('image_path'),
    videoPath: text('video_path'),
    publishedOn: date('published_on').notNull().default(sql`CURRENT_DATE`),
    isPublished: boolean('is_published').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('news_posts_published_idx').on(t.publishedOn, t.id)],
);

// ---------- Warehouse (services/warehouse.ts) ----------

/** How much of an ingredient one of a product takes (in the ingredient's unit). */
export interface IngredientUse {
  id: number;
  qty: number;
}

/**
 * What the owner makes the goods from: meat, flour, onions, packaging. Quantities are in `unit`
 * (grams, millilitres or pieces); the admin shows kilograms and litres.
 */
export const ingredients = pgTable('ingredients', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  unit: ingredientUnit('unit').notNull(),
  /**
   * What is left. It may go below zero: an order is never refused for want of flour, and a
   * negative number tells the owner a purchase was not written down.
   */
  stockQty: doublePrecision('stock_qty').notNull().default(0),
  /** The average price of one unit of what is left (AMD; 4.5 a gram is 4 500 ֏ a kilogram). */
  unitCostAmd: doublePrecision('unit_cost_amd').notNull().default(0),
  ...timestamps,
});

/** What the owner bought: it adds to the stock and moves the average price. */
export const ingredientPurchases = pgTable(
  'ingredient_purchases',
  {
    id: serial('id').primaryKey(),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    qty: doublePrecision('qty').notNull(),
    paidAmd: integer('paid_amd').notNull(),
    purchasedOn: date('purchased_on').notNull().default(sql`CURRENT_DATE`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('ingredient_purchases_qty_positive', sql`${t.qty} > 0`),
    check('ingredient_purchases_paid_non_negative', sql`${t.paidAmd} >= 0`),
    index('ingredient_purchases_date_idx').on(t.purchasedOn, t.id),
  ],
);

/** What one of a product (one pack) is made of. An ingredient in use cannot be deleted. */
export const productIngredients = pgTable(
  'product_ingredients',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'restrict' }),
    qty: doublePrecision('qty').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.ingredientId] }),
    check('product_ingredients_qty_positive', sql`${t.qty} > 0`),
  ],
);
