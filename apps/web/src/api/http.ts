// The real API (apps/api). In development Vite proxies /api to it; in production nginx does.

import type {
  Category,
  CustomOrderInput,
  OrderInput,
  Product,
  Settings,
  StockRequestInput,
  SubmitCustomOrderResult,
  SubmitOrderResult,
} from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function get<T>(path: string): Promise<T> {
  // A plain GET, so it can reuse the answer index.html already asked the browser to preload.
  const response = await fetch(BASE + path);
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getProducts(): Promise<Product[]> {
  return get<Product[]>('/api/products');
}

export function getCategories(): Promise<Category[]> {
  return get<Category[]>('/api/categories');
}

export function getSettings(): Promise<Settings> {
  return get<Settings>('/api/settings');
}

export async function submitOrder(input: OrderInput): Promise<SubmitOrderResult> {
  const response = await post('/api/orders', input);
  // 201 accepted, 409 not enough stock: both carry a SubmitOrderResult body.
  if (response.status === 201 || response.status === 409) {
    return (await response.json()) as SubmitOrderResult;
  }
  if (response.status === 429) return { ok: false, error: 'rate_limited' };
  if (response.status === 400) return { ok: false, error: 'invalid' };
  throw new Error(`POST /api/orders failed: ${response.status}`);
}

export async function submitCustomOrder(input: CustomOrderInput): Promise<SubmitCustomOrderResult> {
  const response = await post('/api/custom-orders', input);
  if (response.status === 201) return (await response.json()) as SubmitCustomOrderResult;
  if (response.status === 429) return { ok: false, error: 'rate_limited' };
  if (response.status === 409) return { ok: false, error: 'unavailable' };
  if (response.status === 400) return { ok: false, error: 'invalid' };
  throw new Error(`POST /api/custom-orders failed: ${response.status}`);
}

export async function createStockRequest(input: StockRequestInput): Promise<void> {
  const response = await post('/api/stock-requests', input);
  if (!response.ok) throw new Error(`POST /api/stock-requests failed: ${response.status}`);
}
