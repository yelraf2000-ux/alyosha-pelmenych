// Client for the admin API (/api/admin/*). The session lives in an httpOnly cookie,
// so there is no token to keep here: the browser sends the cookie by itself.

import type {
  AdminCategory,
  AdminCustomOrder,
  AdminOrder,
  AdminOrderSummary,
  AdminProduct,
  OrderStats,
  OrderStatus,
  SaveProductResult,
  Settings,
  StockRequestGroup,
  StockRequestStatus,
  StockShortage,
  TodayView,
} from '@alyosha/shared';

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/admin';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: { fields?: string[]; shortages?: StockShortage[] } | null,
  ) {
    super(code);
  }
}

let onUnauthorized: (() => void) | null = null;

/** Called when any request finds the session gone (expired, or the password was changed). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch(BASE + path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined && !isForm ? { 'content-type': 'application/json' } : undefined,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') onUnauthorized?.();
    const code = (data as { error?: string } | null)?.error ?? 'error';
    throw new ApiError(response.status, code, data as ApiError['body']);
  }
  return data as T;
}

export type ProductInput = {
  name: string;
  slug?: string;
  description: string;
  /** A category's slug. */
  category: string;
  priceAmd: number;
  weightLabel: string;
  stockQty: number;
  isNew: boolean;
  isActive: boolean;
};

export const adminApi = {
  me: () => request<{ ok: true }>('GET', '/me'),
  login: (password: string) => request<{ ok: true }>('POST', '/login', { password }),
  logout: () => request<{ ok: true }>('POST', '/logout'),

  today: () => request<TodayView>('GET', '/today'),

  products: () => request<AdminProduct[]>('GET', '/products'),
  product: (id: number) => request<AdminProduct>('GET', `/products/${id}`),
  createProduct: (input: ProductInput) => request<SaveProductResult>('POST', '/products', input),
  updateProduct: (id: number, patch: Partial<ProductInput>) =>
    request<SaveProductResult>('PATCH', `/products/${id}`, patch),
  deleteProduct: (id: number) => request<{ ok: true }>('DELETE', `/products/${id}`),
  reorderProducts: (ids: number[]) => request<AdminProduct[]>('POST', '/products/reorder', { ids }),
  uploadImage: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<SaveProductResult>('POST', `/products/${id}/image`, form);
  },
  deleteImage: (id: number) => request<SaveProductResult>('DELETE', `/products/${id}/image`),
  /** The server converts the clip before it answers, so this can take a minute or two. */
  uploadVideo: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<SaveProductResult>('POST', `/products/${id}/video`, form);
  },
  deleteVideo: (id: number) => request<SaveProductResult>('DELETE', `/products/${id}/video`),

  categories: () => request<AdminCategory[]>('GET', '/categories'),
  createCategory: (name: string) => request<AdminCategory>('POST', '/categories', { name }),
  renameCategory: (slug: string, name: string) =>
    request<AdminCategory>('PATCH', `/categories/${encodeURIComponent(slug)}`, { name }),
  deleteCategory: (slug: string) => request<{ ok: true }>('DELETE', `/categories/${encodeURIComponent(slug)}`),

  stockRequests: (includeHandled: boolean) =>
    request<StockRequestGroup[]>('GET', `/stock-requests${includeHandled ? '?all=1' : ''}`),
  setRequestStatus: (id: number, status: StockRequestStatus) =>
    request<{ ok: true }>('PATCH', `/stock-requests/${id}`, { status }),
  markNotified: (productId: number) =>
    request<{ ok: true; updated: number }>('POST', `/products/${productId}/stock-requests/notified`),

  orders: (status: OrderStatus | undefined, offset: number) =>
    request<{ orders: AdminOrderSummary[]; hasMore: boolean }>(
      'GET',
      `/orders?offset=${offset}${status ? `&status=${status}` : ''}`,
    ),
  order: (id: number) => request<AdminOrder>('GET', `/orders/${id}`),
  /** Both dates as YYYY-MM-DD in the shop's time zone, both days included. */
  orderStats: (from: string, to: string) => request<OrderStats>('GET', `/orders/stats?from=${from}&to=${to}`),
  setOrderStatus: (id: number, status: OrderStatus) =>
    request<{ ok: true; order: AdminOrder }>('PATCH', `/orders/${id}`, { status }),

  customOrders: () => request<AdminCustomOrder[]>('GET', '/custom-orders'),
  setCustomOrderStatus: (id: number, status: OrderStatus) =>
    request<AdminCustomOrder>('PATCH', `/custom-orders/${id}`, { status }),

  settings: () => request<Settings>('GET', '/settings'),
  saveSettings: (settings: Settings) => request<Settings>('PUT', '/settings', settings),
};
