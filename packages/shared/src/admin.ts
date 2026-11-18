// Types and helpers for the admin panel (SPEC §7). The input schemas are in admin-schemas.ts.

import type { Category, DeliveryMethod, Product, StockShortage } from './shop';

export const ORDER_STATUSES = ['new', 'confirmed', 'done', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// ---------- Views returned by the admin API ----------

export type AdminProduct = Product;

export interface AdminCategory extends Category {
  /** Products in it, hidden ones included. Only an empty category can be deleted. */
  productCount: number;
}

/** Returned after saving a product. */
export interface SaveProductResult {
  product: AdminProduct;
}

export interface AdminOrderSummary {
  id: number;
  publicNumber: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  deliveryMethod: DeliveryMethod;
  totalAmd: number;
  itemsCount: number;
  /** Some of it is made to order. */
  isPreorder: boolean;
  createdAt: string;
}

export interface AdminOrder extends AdminOrderSummary {
  customerTelegram: string | null;
  comment: string | null;
  deliveryAddress: string | null;
  itemsTotalAmd: number;
  /** Taken off the goods by `promoCode`; 0 without one. */
  discountAmd: number;
  promoCode: string | null;
  deliveryFeeAmd: number;
  /** Delivery is not in the total: the buyer pays the courier separately. */
  deliveryExtra: boolean;
  /** `preorderQty`: how many of `qty` were not in stock and are made to order. */
  items: { productId: number; name: string; priceAmd: number; qty: number; preorderQty: number }[];
  /** The buyer pressed Start in the shop's bot: status changes reach them in Telegram. */
  telegramLinked: boolean;
  updatedAt: string;
}

/** A «Свой рецепт» request as the owner sees it. It has no price: he names one when he confirms. */
export interface AdminCustomOrder {
  id: number;
  publicNumber: string;
  status: OrderStatus;
  recipeName: string;
  base: string;
  modifiers: string[];
  spices: string[];
  weightGrams: number;
  customerName: string;
  customerPhone: string;
  customerTelegram: string | null;
  comment: string | null;
  /** The buyer pressed Start in the shop's bot: status changes reach them in Telegram. */
  telegramLinked: boolean;
  createdAt: string;
  /** What the owner charges for it, once he has named a price; null until then. */
  priceAmd: number | null;
  /** What making it cost him, if he has written it down; with the price it gives the profit. */
  costAmd: number | null;
}

export type ChangeOrderStatusResult =
  | { ok: true; order: AdminOrder }
  | { ok: false; error: 'not_found' }
  /** Reopening a cancelled order needs its items back, and they are no longer in stock. */
  | { ok: false; error: 'insufficient_stock'; shortages: StockShortage[] };

export interface TodayView {
  newOrders: number;
  confirmedOrders: number;
  /** «Свой рецепт» requests nobody has answered yet. */
  newCustomOrders: number;
  /** Total quantity per product across orders that are new or confirmed. */
  totals: { productId: number; name: string; qty: number }[];
}

// ---------- Warehouse ----------

/** Grams, millilitres or pieces. The admin shows the first two as kilograms and litres. */
export const INGREDIENT_UNITS = ['g', 'ml', 'pcs'] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

/** Something the goods are made from: meat, flour, packaging. */
export interface AdminIngredient {
  id: number;
  name: string;
  unit: IngredientUnit;
  /** What is left, in `unit`. Below zero when more was used than was written down as bought. */
  stockQty: number;
  /** The average price of one `unit` of what is left, in AMD (4.5 a gram: 4 500 ֏ a kilogram). */
  unitCostAmd: number;
}

export interface IngredientPurchase {
  id: number;
  ingredientId: number;
  qty: number;
  paidAmd: number;
  /** YYYY-MM-DD. */
  purchasedOn: string;
}

/** How much of an ingredient one of a product (one pack) takes, in the ingredient's unit. */
export interface CompositionLine {
  ingredientId: number;
  qty: number;
}

/** Everything the «Склад» page shows. */
export interface WarehouseView {
  ingredients: AdminIngredient[];
  /** The latest purchases, newest first. */
  purchases: IngredientPurchase[];
  /** Every product that has a composition. */
  products: { id: number; name: string; priceAmd: number; composition: CompositionLine[] }[];
}

/** What one of a product costs to make today: its composition at the warehouse's average prices. */
export function compositionCost(composition: CompositionLine[], ingredients: Pick<AdminIngredient, 'id' | 'unitCostAmd'>[]): number {
  const price = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.unitCostAmd]));
  return Math.round(composition.reduce((sum, line) => sum + line.qty * (price.get(line.ingredientId) ?? 0), 0));
}

/** The shop's clock: an order belongs to the day it was placed on in Yerevan. */
export const SHOP_TIME_ZONE = 'Asia/Yerevan';

/** The longest period the statistics are counted for at once. */
export const STATS_MAX_DAYS = 366;

export interface OrderCountAndSum {
  count: number;
  totalAmd: number;
}

/**
 * What happened to the orders placed between two days (both included, dates as YYYY-MM-DD in the
 * shop's time zone). Everything except `byStatus`, `cancelled` and the `cancelled` column of
 * `days` leaves cancelled orders out.
 */
export interface OrderStats {
  from: string;
  to: string;
  /** Every order placed in the period, whatever became of it. */
  placed: OrderCountAndSum;
  /** The ones that were not cancelled: the real sales. */
  kept: OrderCountAndSum;
  cancelled: OrderCountAndSum;
  byStatus: Record<OrderStatus, OrderCountAndSum>;
  pickupCount: number;
  courierCount: number;
  /**
   * What was sold, most first. `costedQty` of `qty` had a known cost when ordered; `profitAmd`
   * is their price minus that cost (before promo discounts), null when none of them had one.
   */
  products: { productId: number; name: string; qty: number; totalAmd: number; costedQty: number; profitAmd: number | null }[];
  /** One line per day that had orders, oldest first. `profitAmd` as in `profit`. */
  days: { date: string; count: number; cancelledCount: number; totalAmd: number; profitAmd: number }[];
  /**
   * The profit on the goods of the orders that were not cancelled: what the goods brought after
   * promo discounts (`goodsAmd`, delivery left out: it pays the courier) minus what they cost to
   * make (`costAmd`). Goods with no cost known (`uncostedQty` of them: a product without a
   * composition) add their price and no cost.
   */
  profit: { goodsAmd: number; costAmd: number; profitAmd: number; uncostedQty: number };
  /** What the owner paid for the warehouse purchases dated in the period. */
  purchasesAmd: number;
  /**
   * «Свой рецепт» requests in the period, cancelled ones left out. Only those the owner has put a
   * price on (`pricedCount`) are in `totalAmd`; only those with a price and a cost (`costedCount`)
   * are in `profitAmd`.
   */
  recipes: { count: number; pricedCount: number; totalAmd: number; costedCount: number; profitAmd: number };
  /**
   * Orders placed with a promo code, cancelled ones left out: one line per code, most used first.
   * `totalAmd` is what those orders came to after their discount.
   */
  promoCodes: { code: string; count: number; discountAmd: number; totalAmd: number }[];
}

/** YYYY-MM-DD and a real calendar day. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Today's date in the shop's time zone, as YYYY-MM-DD. */
export function shopToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(now);
}

/** A date `days` away from `date` (YYYY-MM-DD in, YYYY-MM-DD out). */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** How many days the period covers, both ends included. */
export function daysInRange(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

// ---------- Helpers ----------

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** "Пельмени с говядиной" → "pelmeni-s-govyadinoy". Returns '' when nothing usable is left. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .split('')
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** The 400px variant of a product image stored by the API as `…-1000.webp`. */
export function smallImagePath(imagePath: string): string {
  return imagePath.replace(/-1000\.webp$/, '-400.webp');
}
