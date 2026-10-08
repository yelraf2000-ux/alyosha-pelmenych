import { sql } from 'drizzle-orm';
import {
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

export const productCategory = pgEnum('product_category', ['pelmeni', 'vareniki', 'manty', 'other']);
export const deliveryMethod = pgEnum('delivery_method', ['pickup', 'courier']);
export const orderStatus = pgEnum('order_status', ['new', 'confirmed', 'done', 'cancelled']);
export const stockRequestStatus = pgEnum('stock_request_status', ['open', 'notified', 'closed']);

/** Feeds the human-friendly order number: A-0001, A-0002, … */
export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 1, increment: 1 });

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    category: productCategory('category').notNull(),
    priceAmd: integer('price_amd').notNull(),
    weightLabel: text('weight_label').notNull().default(''),
    stockQty: integer('stock_qty').notNull().default(0),
    isNew: boolean('is_new').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    imagePath: text('image_path'),
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
    totalAmd: integer('total_amd').notNull(),
    status: orderStatus('status').notNull().default('new'),
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
