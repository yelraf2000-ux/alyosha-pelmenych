// Types and helpers for the admin panel (SPEC §7). The input schemas are in admin-schemas.ts.

import type { DeliveryMethod, Product, StockShortage } from './shop';

export const ORDER_STATUSES = ['new', 'confirmed', 'done', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STOCK_REQUEST_STATUSES = ['open', 'notified', 'closed'] as const;
export type StockRequestStatus = (typeof STOCK_REQUEST_STATUSES)[number];

// ---------- Views returned by the admin API ----------

export interface AdminProduct extends Product {
  /** Open "notify me" requests for this product. */
  waitingCount: number;
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
  items: { productId: number; name: string; priceAmd: number; qty: number }[];
  updatedAt: string;
}

export type ChangeOrderStatusResult =
  | { ok: true; order: AdminOrder }
  | { ok: false; error: 'not_found' }
  /** Reopening a cancelled order needs its items back, and they are no longer in stock. */
  | { ok: false; error: 'insufficient_stock'; shortages: StockShortage[] };

export interface TodayView {
  newOrders: number;
  confirmedOrders: number;
  /** Total quantity per product across orders that are new or confirmed. */
  totals: { productId: number; name: string; qty: number }[];
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
