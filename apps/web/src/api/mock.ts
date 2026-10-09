// In-browser stand-in for the API, used only by the static demo build (`npm run build:demo`),
// which can be put on any static host to show the client without a server.
//
// Stock, the order counter and "notify me" requests are kept in localStorage,
// which makes the demo behave like the real thing: an order lowers stock,
// and a second tab with a stale cart is refused on submit.

import { calcDeliveryFee, isDeliveryExtra } from '../lib/delivery';
import { normalizePhone } from '../lib/validation';
import { MOCK_CATEGORIES, MOCK_PRODUCTS } from '../mock/products';
import { MOCK_SETTINGS } from '../mock/settings';
import type {
  Category,
  CustomOrderInput,
  OrderInput,
  OrderItemView,
  Product,
  Settings,
  StockRequestInput,
  StockShortage,
  SubmitCustomOrderResult,
  SubmitOrderResult,
} from '../types';

const DB_KEY = 'ap_demo_db_v1';

interface DemoDb {
  stock: Record<string, number>;
  orderSeq: number;
  stockRequests: StockRequestInput[];
}

// Used when localStorage is unavailable (private mode, blocked storage).
let memoryDb: DemoDb | null = null;

function freshDb(): DemoDb {
  return {
    stock: Object.fromEntries(MOCK_PRODUCTS.map((p) => [p.id, p.stockQty])),
    orderSeq: 41,
    stockRequests: [],
  };
}

function readDb(): DemoDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoDb> | null;
      if (parsed && typeof parsed.stock === 'object' && parsed.stock && typeof parsed.orderSeq === 'number') {
        return { stock: parsed.stock, orderSeq: parsed.orderSeq, stockRequests: parsed.stockRequests ?? [] };
      }
    }
  } catch {
    // fall through to the in-memory copy
  }
  return memoryDb ?? freshDb();
}

function writeDb(db: DemoDb): void {
  memoryDb = db;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // the in-memory copy still works for this tab
  }
}

function stockOf(db: DemoDb, product: Product): number {
  return Math.max(0, db.stock[product.id] ?? product.stockQty);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getProducts(): Promise<Product[]> {
  await delay(120);
  const db = readDb();
  return MOCK_PRODUCTS.filter((p) => p.isActive)
    .map((p) => ({ ...p, stockQty: stockOf(db, p) }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getCategories(): Promise<Category[]> {
  await delay(60);
  return [...MOCK_CATEGORIES];
}

export async function getSettings(): Promise<Settings> {
  await delay(60);
  return { ...MOCK_SETTINGS };
}

export async function submitOrder(input: OrderInput): Promise<SubmitOrderResult> {
  await delay(500);

  const phone = normalizePhone(input.customerPhone);
  const courierWithoutAddress = input.deliveryMethod === 'courier' && !input.deliveryAddress?.trim();
  if (
    input.website ||
    !phone ||
    input.customerName.trim().length < 2 ||
    courierWithoutAddress ||
    input.items.length === 0
  ) {
    return { ok: false, error: 'invalid' };
  }

  const db = readDb();
  const shortages: StockShortage[] = [];
  const items: OrderItemView[] = [];

  for (const line of input.items) {
    const product = MOCK_PRODUCTS.find((p) => p.id === line.productId && p.isActive);
    if (!product || !Number.isInteger(line.qty) || line.qty < 1) {
      return { ok: false, error: 'invalid' };
    }
    const available = stockOf(db, product);
    if (line.qty > available) {
      shortages.push({ productId: product.id, name: product.name, available });
    }
    items.push({ productId: product.id, name: product.name, priceAmd: product.priceAmd, qty: line.qty });
  }

  if (shortages.length > 0) {
    return { ok: false, error: 'insufficient_stock', shortages };
  }

  for (const item of items) {
    db.stock[item.productId] = (db.stock[item.productId] ?? 0) - item.qty;
  }
  db.orderSeq += 1;
  writeDb(db);

  const itemsTotalAmd = items.reduce((sum, item) => sum + item.priceAmd * item.qty, 0);
  const deliveryFeeAmd = calcDeliveryFee(input.deliveryMethod, itemsTotalAmd, MOCK_SETTINGS);

  return {
    ok: true,
    order: {
      publicNumber: 'A-' + String(db.orderSeq).padStart(4, '0'),
      items,
      itemsTotalAmd,
      deliveryFeeAmd,
      deliveryExtra: isDeliveryExtra(input.deliveryMethod, itemsTotalAmd, MOCK_SETTINGS),
      totalAmd: itemsTotalAmd + deliveryFeeAmd,
      deliveryMethod: input.deliveryMethod,
      deliveryAddress: input.deliveryMethod === 'courier' ? (input.deliveryAddress?.trim() ?? null) : null,
      telegramLink: null, // the demo has no bot
    },
  };
}

/** The demo has nobody to send a recipe to: it only checks the form the way the server would. */
export async function submitCustomOrder(input: CustomOrderInput): Promise<SubmitCustomOrderResult> {
  await delay(500);
  const valid = !input.website && input.recipeName.trim() && input.base && normalizePhone(input.customerPhone);
  return valid ? { ok: true, telegramLink: null } : { ok: false, error: 'invalid' };
}

export async function createStockRequest(input: StockRequestInput): Promise<void> {
  await delay(400);
  const db = readDb();
  db.stockRequests.push(input);
  writeDb(db);
}

/** Demo only: puts stock and the order counter back to the starting values. */
export function resetDemo(): void {
  writeDb(freshDb());
}
