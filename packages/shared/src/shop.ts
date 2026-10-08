// Types and rules shared by the storefront and the API (SPEC §5–6).
// Nothing here depends on zod, so the storefront bundle stays small; the schemas are in shop-schemas.ts.

// ---------- Domain types ----------

export const CATEGORIES = ['pelmeni', 'vareniki', 'manty', 'khinkali', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const DELIVERY_METHODS = ['pickup', 'courier'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export interface Product {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: Category;
  priceAmd: number;
  weightLabel: string;
  stockQty: number;
  isNew: boolean;
  isActive: boolean;
  sortOrder: number;
  imagePath: string | null;
  /** A short clip shown on the product page, or null. See `videoInfo`. */
  videoPath: string | null;
}

export interface Settings {
  aboutText: string;
  deliveryText: string;
  contactsText: string;
  pickupAddress: string;
  courierFeeAmd: number;
  freeDeliveryFromAmd: number;
  deliveryNote: string;
  heroTitle: string;
  heroSubtitle: string;
  phonePublic: string;
  telegramPublic: string;
  instagramUrl: string;
  tiktokUrl: string;
}

/** What the checkout form sends. The server validates it with `orderInputSchema`. */
export interface OrderInput {
  customerName: string;
  customerPhone: string;
  customerTelegram: string | null;
  comment: string | null;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string | null;
  /** Honeypot: real buyers never fill it. */
  website: string;
  items: { productId: number; qty: number }[];
}

export interface OrderItemView {
  productId: number;
  name: string;
  priceAmd: number;
  qty: number;
}

export interface OrderView {
  publicNumber: string;
  items: OrderItemView[];
  itemsTotalAmd: number;
  deliveryFeeAmd: number;
  /** Delivery is not in the total: the buyer pays the courier separately (see `isDeliveryExtra`). */
  deliveryExtra: boolean;
  totalAmd: number;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string | null;
}

export interface StockShortage {
  productId: number;
  name: string;
  available: number;
}

export type SubmitOrderResult =
  | { ok: true; order: OrderView }
  | { ok: false; error: 'insufficient_stock'; shortages: StockShortage[] }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'rate_limited' };

export interface StockRequestInput {
  productId: number;
  name: string;
  phone: string;
  telegram: string | null;
}

// ---------- Rules ----------

/**
 * Accepts Armenian numbers as +374XXXXXXXX, 374XXXXXXXX or 0XXXXXXXX,
 * and any other international number written with a leading +.
 * Returns the number in +XXXXXXXX form, or null if it is not a phone number.
 */
export function normalizePhone(raw: string): string | null {
  const value = raw.replace(/[\s\-()]/g, '');
  if (/^\+374\d{8}$/.test(value)) return value;
  if (/^374\d{8}$/.test(value)) return '+' + value;
  if (/^0\d{8}$/.test(value)) return '+374' + value.slice(1);
  if (/^\+(?!374)\d{9,15}$/.test(value)) return value;
  return null;
}

/** Returns the username without @, or null if it is not a valid Telegram username. */
export function normalizeTelegram(raw: string): string | null {
  const value = raw.trim().replace(/^@/, '');
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(value) ? value : null;
}

export function calcDeliveryFee(
  method: DeliveryMethod,
  itemsTotalAmd: number,
  settings: Pick<Settings, 'courierFeeAmd' | 'freeDeliveryFromAmd'>,
): number {
  if (method === 'pickup') return 0;
  return itemsTotalAmd >= settings.freeDeliveryFromAmd ? 0 : settings.courierFeeAmd;
}

/**
 * The shop has no fixed courier price (the fee in the settings is 0): below the free-delivery
 * threshold the buyer pays the courier separately, on top of the order. The site then shows
 * «+ доставка» where a fee would be, and the order's total is the goods alone.
 */
export function isDeliveryExtra(
  method: DeliveryMethod,
  itemsTotalAmd: number,
  settings: Pick<Settings, 'courierFeeAmd' | 'freeDeliveryFromAmd'>,
): boolean {
  return method === 'courier' && settings.courierFeeAmd === 0 && itemsTotalAmd < settings.freeDeliveryFromAmd;
}

const NBSP = String.fromCharCode(0xa0);

/**
 * Product videos are stored as `…/<id>-<width>x<height>.mp4` with a poster picture beside them.
 * Returns the poster's path and the frame size, or null for a path that is not in that form.
 */
export function videoInfo(videoPath: string): { poster: string; width: number; height: number } | null {
  const match = /-(\d+)x(\d+)\.mp4$/.exec(videoPath);
  if (!match) return null;
  return { poster: videoPath.replace(/\.mp4$/, '.webp'), width: Number(match[1]), height: Number(match[2]) };
}

/** 1640 → "1 640 ֏" (SPEC §5). */
export function formatAmd(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + '֏';
}
