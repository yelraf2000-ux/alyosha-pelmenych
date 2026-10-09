// Types and rules shared by the storefront and the API (SPEC §5–6).
// Nothing here depends on zod, so the storefront bundle stays small; the schemas are in shop-schemas.ts.

// ---------- Domain types ----------

/**
 * A group of products in the catalog. The owner adds and names them in the admin.
 * Products point at one by `slug`; people read `name`.
 */
export interface Category {
  slug: string;
  name: string;
}

export const DELIVERY_METHODS = ['pickup', 'courier'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export interface Product {
  id: number;
  slug: string;
  name: string;
  description: string;
  /** The slug of its `Category`. */
  category: string;
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
  /** The owner's own Telegram (username without @): where the bot's «Написать Алёше» button leads. */
  telegramContact: string;
  /** «Свой рецепт»: what a buyer may choose from, one option per line (see `optionLines`). */
  customBases: string;
  customModifiers: string;
  customSpices: string;
}

// ---------- «Свой рецепт»: пельмени made to the buyer's own recipe ----------

/** The smallest batch, the step it grows by and the largest one, in grams. */
export const CUSTOM_MIN_GRAMS = 2000;
export const CUSTOM_STEP_GRAMS = 500;
export const CUSTOM_MAX_GRAMS = 30_000;
export const CUSTOM_NAME_MAX = 40;

/** The lists the shop starts with (Алексей's own, 9 Oct 2026). He edits them in the settings. */
export const DEFAULT_CUSTOM_BASES = ['Говядина', 'Свинина', 'Свинина + говядина', 'Куриное бедро', 'Куриная грудка', 'Бедро + грудка'].join('\n');
export const DEFAULT_CUSTOM_MODIFIERS = [
  'Сливочное масло', 'Сливки', 'Шампиньоны', 'Сладкий перец', 'Острый перец', 'Кабачок', 'Морковь',
  'Репчатый лук', 'Жареный лук', 'Зелёный лук', 'Креветка', 'Чеснок', 'Кинза', 'Петрушка',
].join('\n');
export const DEFAULT_CUSTOM_SPICES = [
  'Меньше соли', 'Без соли', 'Чёрный перец', 'Кориандр', 'Паприка', 'Сушёный чеснок', 'Хмели-сунели', 'Итальянские травы',
].join('\n');

/** Options that cancel each other out: choosing one of a group unticks the others. */
export const CUSTOM_EXCLUSIVE_GROUPS: readonly (readonly string[])[] = [['Меньше соли', 'Без соли']];

/** What the «Свой рецепт» form sends. The server validates it with `customOrderSchema`. */
export interface CustomOrderInput {
  /** The buyer's name for the recipe; it goes on the package. */
  recipeName: string;
  base: string;
  modifiers: string[];
  spices: string[];
  weightGrams: number;
  customerName: string;
  customerPhone: string;
  customerTelegram: string | null;
  comment: string | null;
  /** Honeypot: must stay empty. */
  website?: string;
}

export type SubmitCustomOrderResult =
  | { ok: true; /** See `OrderView.telegramLink`. */ telegramLink: string | null }
  | { ok: false; error: 'invalid' | 'rate_limited' | 'unavailable' };

/** The options written in a settings field, one per line: trimmed, without blanks or repeats. */
export function optionLines(text: string): string[] {
  return [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))];
}

/** 2500 → «2,5 кг». */
export function formatKg(grams: number): string {
  return `${String(grams / 1000).replace('.', ',')} кг`;
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
  /**
   * Opens the shop's Telegram bot for this order: after pressing Start there, the buyer gets a
   * message at every change of the order's status. null while the bot is not connected.
   */
  telegramLink: string | null;
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

/** The name of a product's category, or its slug if the category is not in the list. */
export function categoryName(categories: readonly Category[], slug: string): string {
  return categories.find((category) => category.slug === slug)?.name ?? slug;
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
