// Types and helpers for the admin panel (SPEC §7). The input schemas are in admin-schemas.ts.

import type { Category, DeliveryMethod, Product, StockShortage } from './shop';

export const ORDER_STATUSES = ['new', 'confirmed', 'done', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STOCK_REQUEST_STATUSES = ['open', 'notified', 'closed'] as const;
export type StockRequestStatus = (typeof STOCK_REQUEST_STATUSES)[number];

// ---------- Views returned by the admin API ----------

export interface AdminProduct extends Product {
  /** Open "notify me" requests for this product. */
  waitingCount: number;
}

export interface AdminCategory extends Category {
  /** Products in it, hidden ones included. Only an empty category can be deleted. */
  productCount: number;
}

export interface AdminStockRequest {
  id: number;
  productId: number;
  name: string;
  phone: string;
  telegram: string | null;
  status: StockRequestStatus;
  createdAt: string;
}

export interface StockRequestGroup {
  product: { id: number; name: string; stockQty: number };
  requests: AdminStockRequest[];
}

/** Returned after saving a product. `waiting` is filled when stock was just raised from zero. */
export interface SaveProductResult {
  product: AdminProduct;
  waiting: AdminStockRequest[];
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
  createdAt: string;
}

export interface AdminOrder extends AdminOrderSummary {
  customerTelegram: string | null;
  comment: string | null;
  deliveryAddress: string | null;
  itemsTotalAmd: number;
  deliveryFeeAmd: number;
  /** Delivery is not in the total: the buyer pays the courier separately. */
  deliveryExtra: boolean;
  items: { productId: number; name: string; priceAmd: number; qty: number }[];
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
  /** What was sold, most first. */
  products: { productId: number; name: string; qty: number; totalAmd: number }[];
  /** One line per day that had orders, oldest first. */
  days: { date: string; count: number; cancelledCount: number; totalAmd: number }[];
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
