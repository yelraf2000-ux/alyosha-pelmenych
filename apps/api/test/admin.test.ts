import { sql } from 'drizzle-orm';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_TTL_SECONDS, type AdminAuth } from '../src/auth';
import { applyStoredPassword, startPasswordReset } from '../src/services/admin-password';
import type { Keyboard } from '../src/services/buyer-bot';
import {
  addProduct,
  adminCookie,
  countRows,
  createTestContext,
  orderBody,
  postOrder,
  stockOf,
  TEST_ADMIN,
  TEST_ADMIN_CHAT,
  TEST_ADMIN_PASSWORD,
  TEST_WEBHOOK_SECRET,
  type TestContext,
} from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
beforeEach(async () => {
  await ctx.reset();
});
afterAll(async () => {
  await ctx.close();
});

/** A request from the signed-in admin. */
function asAdmin(options: InjectOptions, app: FastifyInstance = ctx.app) {
  return app.inject({ ...options, headers: { ...options.headers, cookie: adminCookie() } });
}

async function placeOrderFor(productId: number, qty: number): Promise<number> {
  const response = await postOrder(ctx.app, orderBody([{ productId, qty }]));
  expect(response.statusCode).toBe(201);
  const stored = await ctx.db.execute<{ id: number }>(sql`SELECT max(id)::int AS id FROM orders`);
  return stored.rows[0]!.id;
}

function setStatus(orderId: number, status: string) {
  return asAdmin({ method: 'PATCH', url: `/api/admin/orders/${orderId}`, payload: { status } });
}

function multipartImage(content: Buffer, filename = 'photo.jpg', type = 'image/jpeg') {
  const boundary = '----test-boundary';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), content, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('admin access', () => {
  const routes: InjectOptions[] = [
    { method: 'GET', url: '/api/admin/me' },
    { method: 'GET', url: '/api/admin/today' },
    { method: 'GET', url: '/api/admin/products' },
    { method: 'POST', url: '/api/admin/products', payload: { name: 'X', category: 'pelmeni', priceAmd: 1 } },
    { method: 'PATCH', url: '/api/admin/products/1', payload: { stockQty: 99 } },
    { method: 'DELETE', url: '/api/admin/products/1' },
    { method: 'POST', url: '/api/admin/products/reorder', payload: { ids: [1] } },
    { method: 'POST', url: '/api/admin/products/1/image' },
    { method: 'DELETE', url: '/api/admin/products/1/image' },
    { method: 'POST', url: '/api/admin/products/1/video' },
    { method: 'DELETE', url: '/api/admin/products/1/video' },
    { method: 'GET', url: '/api/admin/orders' },
    { method: 'GET', url: '/api/admin/orders/1' },
    { method: 'PATCH', url: '/api/admin/orders/1', payload: { status: 'cancelled' } },
    { method: 'DELETE', url: '/api/admin/orders/1' },
    { method: 'DELETE', url: '/api/admin/custom-orders/1' },
    { method: 'GET', url: '/api/admin/stock-requests' },
    { method: 'PATCH', url: '/api/admin/stock-requests/1', payload: { status: 'notified' } },
    { method: 'POST', url: '/api/admin/products/1/stock-requests/notified' },
    { method: 'GET', url: '/api/admin/settings' },
    { method: 'PUT', url: '/api/admin/settings', payload: {} },
    { method: 'POST', url: '/api/admin/logout' },
    { method: 'GET', url: '/api/admin/no-such-route' },
  ];

  it.each(routes)('refuses $method $url without a session', async (route) => {
    const id = await addProduct(ctx.db, { stockQty: 5 });
    expect(id).toBe(1);

    const response = await ctx.app.inject(route);

    expect(response.statusCode).toBe(401);
    expect(await stockOf(ctx.db, id)).toBe(5);
  });

  it('signs in with the right password and sets an httpOnly, SameSite=Strict cookie', async () => {
    const wrong = await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'nope' } });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.headers['set-cookie']).toBeUndefined();

    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: TEST_ADMIN_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies[0]!;
    expect(cookie).toMatchObject({ name: 'ap_admin', httpOnly: true, sameSite: 'Strict', path: '/api/admin' });
    expect(cookie.maxAge).toBe(SESSION_TTL_SECONDS);

    const me = await ctx.app.inject({ url: '/api/admin/me', headers: { cookie: `ap_admin=${cookie.value}` } });
    expect(me.statusCode).toBe(200);
  });

  it('marks the cookie Secure when the site runs on https', async () => {
    const app = await ctx.buildApp({ admin: { ...TEST_ADMIN, secureCookie: true } });
    const login = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: TEST_ADMIN_PASSWORD } });
    expect(login.cookies[0]).toMatchObject({ secure: true });
  });

  it('rejects forged, altered and expired sessions', async () => {
    const me = (cookie: string) => ctx.app.inject({ url: '/api/admin/me', headers: { cookie } });
    const [expiresAt, signature] = adminCookie().split('=')[1]!.split('.') as [string, string];

    expect((await me(adminCookie())).statusCode).toBe(200);
    // A later expiry with the old signature.
    expect((await me(`ap_admin=${Number(expiresAt) + 1000}.${signature}`)).statusCode).toBe(401);
    expect((await me(`ap_admin=${expiresAt}.${signature.slice(0, -2)}xx`)).statusCode).toBe(401);
    expect((await me('ap_admin=garbage')).statusCode).toBe(401);
    // Signed with another secret, or before a password change.
    expect((await me(adminCookie({ ...TEST_ADMIN, sessionSecret: 'another-secret-0123456789abcdefgh' }))).statusCode).toBe(401);
    expect((await me(adminCookie({ ...TEST_ADMIN, passwordHash: 'old-hash' }))).statusCode).toBe(401);
    // Issued 31 days ago.
    expect((await me(adminCookie(TEST_ADMIN, Date.now() - 31 * 24 * 3600 * 1000))).statusCode).toBe(401);
  });

  it('limits login attempts', async () => {
    const app = await ctx.buildApp({ rateLimit: true });
    const attempt = () => app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'guess' } });

    for (let i = 0; i < 5; i += 1) expect((await attempt()).statusCode).toBe(401);
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ ok: false, error: 'rate_limited' });
    // Even the right password waits once the limit is hit.
    const right = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: TEST_ADMIN_PASSWORD } });
    expect(right.statusCode).toBe(429);
  });

  it('refuses state-changing requests that come from another site', async () => {
    const id = await addProduct(ctx.db, { stockQty: 5 });
    const patch = (origin: string) =>
      asAdmin({ method: 'PATCH', url: `/api/admin/products/${id}`, payload: { stockQty: 9 }, headers: { origin } });

    expect((await patch('https://evil.example')).statusCode).toBe(403);
    expect(await stockOf(ctx.db, id)).toBe(5);
    expect((await patch('http://localhost:5173')).statusCode).toBe(200);
    expect(await stockOf(ctx.db, id)).toBe(9);
  });

  it('is switched off while no password is configured', async () => {
    const app = await ctx.buildApp({ admin: null });
    const login = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: TEST_ADMIN_PASSWORD } });
    expect(login.statusCode).toBe(503);
    expect((await asAdmin({ url: '/api/admin/products' }, app)).statusCode).toBe(503);
    // The shop itself keeps working.
    expect((await app.inject({ url: '/api/products' })).statusCode).toBe(200);
  });
});

describe('admin products', () => {
  it('creates a product with a slug made from the name, at the end of the catalog', async () => {
    await addProduct(ctx.db, { sortOrder: 30 });

    const create = (name: string) =>
      asAdmin({ method: 'POST', url: '/api/admin/products', payload: { name, category: 'pelmeni', priceAmd: 2600 } });
    const first = await create('Пельмени с говядиной');
    const second = await create('Пельмени с говядиной');

    expect(first.statusCode).toBe(201);
    expect(first.json().product).toMatchObject({
      slug: 'pelmeni-s-govyadinoy',
      priceAmd: 2600,
      stockQty: 0,
      isActive: true,
      isNew: false,
      sortOrder: 40,
      waitingCount: 0,
    });
    expect(second.json().product.slug).toBe('pelmeni-s-govyadinoy-2');
  });

  it.each([
    ['a negative price', { priceAmd: -1 }],
    ['a fractional stock', { stockQty: 1.5 }],
    ['a negative stock', { stockQty: -2 }],
    ['an unknown category', { category: 'pizza' }],
    ['an empty name', { name: '  ' }],
    ['a slug with spaces', { slug: 'not a slug' }],
  ])('rejects %s', async (_label, patch) => {
    const id = await addProduct(ctx.db, { stockQty: 4, priceAmd: 2000 });

    const response = await asAdmin({ method: 'PATCH', url: `/api/admin/products/${id}`, payload: patch });

    expect(response.statusCode).toBe(400);
    expect(await stockOf(ctx.db, id)).toBe(4);
  });

  it('edits fields, and shows hidden products to the admin but not to buyers', async () => {
    const id = await addProduct(ctx.db, { name: 'Манты', priceAmd: 3000 });

    const response = await asAdmin({
      method: 'PATCH',
      url: `/api/admin/products/${id}`,
      payload: { priceAmd: 3200, isNew: true, isActive: false, description: 'Новое описание' },
    });

    expect(response.json().product).toMatchObject({ priceAmd: 3200, isNew: true, isActive: false, name: 'Манты' });
    expect((await ctx.app.inject({ url: '/api/products' })).json()).toEqual([]);
    expect((await asAdmin({ url: '/api/admin/products' })).json()).toHaveLength(1);
  });

  it('refuses a slug that another product uses', async () => {
    await addProduct(ctx.db, { slug: 'manty' });
    const id = await addProduct(ctx.db);
    const response = await asAdmin({ method: 'PATCH', url: `/api/admin/products/${id}`, payload: { slug: 'manty' } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('slug_taken');
  });

  it('lists who is waiting when stock is raised from zero, and only then', async () => {
    const id = await addProduct(ctx.db, { stockQty: 0 });
    const request = (name: string) =>
      ctx.app.inject({ method: 'POST', url: '/api/stock-requests', payload: { productId: id, name, phone: '+37491123456' } });
    await request('Анна');
    await request('Борис');
    const setStock = async (stockQty: number) =>
      (await asAdmin({ method: 'PATCH', url: `/api/admin/products/${id}`, payload: { stockQty } })).json();

    const raised = await setStock(8);
    expect(raised.product).toMatchObject({ stockQty: 8, waitingCount: 2 });
    expect(raised.waiting.map((r: { name: string }) => r.name)).toEqual(['Анна', 'Борис']);

    // Already in stock: no reminder.
    expect((await setStock(10)).waiting).toEqual([]);

    const marked = await asAdmin({ method: 'POST', url: `/api/admin/products/${id}/stock-requests/notified` });
    expect(marked.json()).toEqual({ ok: true, updated: 2 });
    await setStock(0);
    expect((await setStock(5)).waiting).toEqual([]);
  });

  it('reorders the catalog', async () => {
    const a = await addProduct(ctx.db, { name: 'А', sortOrder: 10 });
    const b = await addProduct(ctx.db, { name: 'Б', sortOrder: 20 });
    const c = await addProduct(ctx.db, { name: 'В', sortOrder: 30 });

    await asAdmin({ method: 'POST', url: '/api/admin/products/reorder', payload: { ids: [c, a, b] } });

    const names = (await ctx.app.inject({ url: '/api/products' })).json().map((p: { name: string }) => p.name);
    expect(names).toEqual(['В', 'А', 'Б']);
  });

  it('deletes a product that was never ordered, and keeps one that was', async () => {
    const unused = await addProduct(ctx.db);
    const ordered = await addProduct(ctx.db);
    await placeOrderFor(ordered, 1);

    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/products/${unused}` })).statusCode).toBe(200);
    const refused = await asAdmin({ method: 'DELETE', url: `/api/admin/products/${ordered}` });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('has_orders');
    expect((await asAdmin({ url: '/api/admin/products' })).json()).toHaveLength(1);
  });
});

describe('product photos', () => {
  const files = () => (existsSync(join(ctx.uploadsDir, 'products')) ? readdirSync(join(ctx.uploadsDir, 'products')) : []);
  beforeEach(() => {
    rmSync(join(ctx.uploadsDir, 'products'), { recursive: true, force: true });
  });
  const photo = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: '#d9a066' } }).jpeg().toBuffer();
  const upload = (id: number, content: Buffer, filename?: string, type?: string) =>
    asAdmin({ method: 'POST', url: `/api/admin/products/${id}/image`, ...multipartImage(content, filename, type) });

  it('stores an upload as 400px and 1000px WebP and serves it with a long cache', async () => {
    const id = await addProduct(ctx.db);

    const response = await upload(id, await photo(2000, 1500));

    expect(response.statusCode).toBe(200);
    const imagePath: string = response.json().product.imagePath;
    expect(imagePath).toMatch(/^\/uploads\/products\/[a-f0-9]{16}-1000\.webp$/);

    for (const [suffix, width] of [['-1000.webp', 1000], ['-400.webp', 400]] as const) {
      const served = await ctx.app.inject({ url: imagePath.replace('-1000.webp', suffix) });
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toBe('image/webp');
      expect(served.headers['cache-control']).toContain('immutable');
      const meta = await sharp(served.rawPayload).metadata();
      expect(meta).toMatchObject({ format: 'webp', width, height: width * 0.75 });
    }
    expect((await ctx.app.inject({ url: '/api/products' })).json()[0].imagePath).toBe(imagePath);
  });

  it('removes the old files when a photo is replaced or deleted', async () => {
    const id = await addProduct(ctx.db);

    await upload(id, await photo(1200, 900));
    const first = files();
    expect(first).toHaveLength(2);

    await upload(id, await photo(1200, 900));
    expect(files()).toHaveLength(2);
    expect(files()).not.toEqual(first);

    const removed = await asAdmin({ method: 'DELETE', url: `/api/admin/products/${id}/image` });
    expect(removed.json().product.imagePath).toBeNull();
    expect(files()).toEqual([]);
  });

  it('rejects files that are not jpg, png or webp, whatever they are called', async () => {
    const id = await addProduct(ctx.db);
    const text = await upload(id, Buffer.from('<script>alert(1)</script>'), 'photo.jpg', 'image/jpeg');
    const gif = await upload(id, await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).gif().toBuffer(), 'photo.jpg');
    const svg = await upload(id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), 'photo.png', 'image/png');

    for (const response of [text, gif, svg]) {
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('bad_image');
    }
    expect(files()).toEqual([]);
    expect((await asAdmin({ url: `/api/admin/products/${id}` })).json().imagePath).toBeNull();
  });

  it('rejects a file over the size limit', async () => {
    const id = await addProduct(ctx.db);
    const response = await upload(id, Buffer.alloc(13 * 1024 * 1024, 1));
    expect(response.statusCode).toBe(413);
  });
});

describe('admin orders', () => {
  it('lists orders newest first, filters by status and shows the details', async () => {
    const id = await addProduct(ctx.db, { name: 'Пельмени', priceAmd: 2400, stockQty: 20 });
    const first = await placeOrderFor(id, 1);
    const second = await placeOrderFor(id, 3);
    await setStatus(first, 'confirmed');

    const all = (await asAdmin({ url: '/api/admin/orders' })).json();
    expect(all.hasMore).toBe(false);
    expect(all.orders.map((o: { publicNumber: string }) => o.publicNumber)).toEqual(['A-0002', 'A-0001']);
    expect(all.orders[0]).toMatchObject({ status: 'new', itemsCount: 3, totalAmd: 7200, customerName: 'Тест' });

    const confirmed = (await asAdmin({ url: '/api/admin/orders?status=confirmed' })).json();
    expect(confirmed.orders.map((o: { id: number }) => o.id)).toEqual([first]);

    const detail = (await asAdmin({ url: `/api/admin/orders/${second}` })).json();
    expect(detail).toMatchObject({
      publicNumber: 'A-0002',
      customerPhone: '+37491123456',
      deliveryMethod: 'pickup',
      items: [{ productId: id, name: 'Пельмени', priceAmd: 2400, qty: 3 }],
    });
  });

  it('returns the items to stock when an order is cancelled, once', async () => {
    const a = await addProduct(ctx.db, { stockQty: 10 });
    const b = await addProduct(ctx.db, { stockQty: 4 });
    const response = await postOrder(ctx.app, orderBody([{ productId: a, qty: 3 }, { productId: b, qty: 4 }]));
    expect(response.statusCode).toBe(201);
    expect([await stockOf(ctx.db, a), await stockOf(ctx.db, b)]).toEqual([7, 0]);

    const cancelled = await setStatus(1, 'cancelled');
    expect(cancelled.json()).toMatchObject({ ok: true, order: { status: 'cancelled' } });
    expect([await stockOf(ctx.db, a), await stockOf(ctx.db, b)]).toEqual([10, 4]);

    // Cancelling again, even several times at once, must not add stock again.
    await Promise.all(Array.from({ length: 8 }, () => setStatus(1, 'cancelled')));
    expect([await stockOf(ctx.db, a), await stockOf(ctx.db, b)]).toEqual([10, 4]);
  });

  it('leaves stock alone for the other status changes', async () => {
    const id = await addProduct(ctx.db, { stockQty: 10 });
    const order = await placeOrderFor(id, 2);

    for (const status of ['confirmed', 'done', 'new', 'confirmed']) {
      expect((await setStatus(order, status)).json().order.status).toBe(status);
      expect(await stockOf(ctx.db, id)).toBe(8);
    }
  });

  it('takes the items again when a cancelled order is reopened, if they are still there', async () => {
    const id = await addProduct(ctx.db, { stockQty: 5, name: 'Манты' });
    const order = await placeOrderFor(id, 4);
    await setStatus(order, 'cancelled');
    expect(await stockOf(ctx.db, id)).toBe(5);

    // Someone else buys most of the returned stock.
    await placeOrderFor(id, 3);

    const refused = await setStatus(order, 'confirmed');
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({
      ok: false,
      error: 'insufficient_stock',
      shortages: [{ productId: id, name: 'Манты', available: 2 }],
    });
    expect(await stockOf(ctx.db, id)).toBe(2);
    expect((await asAdmin({ url: `/api/admin/orders/${order}` })).json().status).toBe('cancelled');

    await asAdmin({ method: 'PATCH', url: `/api/admin/products/${id}`, payload: { stockQty: 4 } });
    expect((await setStatus(order, 'new')).statusCode).toBe(200);
    expect(await stockOf(ctx.db, id)).toBe(0);
  });

  it('keeps stock exact when buyers order while the owner cancels', async () => {
    const id = await addProduct(ctx.db, { stockQty: 10 });
    const orderIds = [await placeOrderFor(id, 2), await placeOrderFor(id, 2), await placeOrderFor(id, 2)];
    expect(await stockOf(ctx.db, id)).toBe(4);

    const results = await Promise.all([
      ...orderIds.map((orderId) => setStatus(orderId, 'cancelled')),
      ...Array.from({ length: 12 }, () => postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]))),
    ]);

    const placed = results.slice(3).filter((r) => r.statusCode === 201).length;
    expect(results.slice(0, 3).every((r) => r.statusCode === 200)).toBe(true);
    expect(results.slice(3).every((r) => [201, 409].includes(r.statusCode))).toBe(true);
    // 10 in total, minus what the new buyers got; never negative, nothing lost.
    expect(await stockOf(ctx.db, id)).toBe(10 - placed);
    expect(placed).toBeGreaterThanOrEqual(4);
  });

  it('rejects an unknown status and an unknown order', async () => {
    const id = await addProduct(ctx.db);
    const order = await placeOrderFor(id, 1);
    expect((await setStatus(order, 'shipped')).statusCode).toBe(400);
    expect((await setStatus(999, 'done')).statusCode).toBe(404);
    expect((await asAdmin({ url: '/api/admin/orders/abc' })).statusCode).toBe(404);
  });

  it('sums what new and confirmed orders need, per product', async () => {
    const a = await addProduct(ctx.db, { name: 'Пельмени', stockQty: 50, sortOrder: 10 });
    const b = await addProduct(ctx.db, { name: 'Манты', stockQty: 50, sortOrder: 20 });
    await placeOrderFor(a, 2); // stays new
    await setStatus(await placeOrderFor(a, 3), 'confirmed');
    await setStatus(await placeOrderFor(b, 4), 'confirmed');
    await setStatus(await placeOrderFor(b, 7), 'done');
    await setStatus(await placeOrderFor(a, 9), 'cancelled');

    expect((await asAdmin({ url: '/api/admin/today' })).json()).toEqual({
      newOrders: 1,
      confirmedOrders: 2,
      newCustomOrders: 0,
      totals: [
        { productId: a, name: 'Пельмени', qty: 5 },
        { productId: b, name: 'Манты', qty: 4 },
      ],
    });
  });
});

describe('deleting orders', () => {
  const remove = (orderId: number) => asAdmin({ method: 'DELETE', url: `/api/admin/orders/${orderId}` });

  it('removes an order with its lines and puts back the goods it was still holding', async () => {
    const id = await addProduct(ctx.db, { stockQty: 10 });
    const fresh = await placeOrderFor(id, 3);
    const confirmed = await placeOrderFor(id, 2);
    await setStatus(confirmed, 'confirmed');
    expect(await stockOf(ctx.db, id)).toBe(5);

    expect((await remove(fresh)).json()).toEqual({ ok: true });
    expect(await stockOf(ctx.db, id)).toBe(8);
    expect((await remove(confirmed)).statusCode).toBe(200);
    expect(await stockOf(ctx.db, id)).toBe(10);

    expect(await countRows(ctx.db, 'orders')).toBe(0);
    expect(await countRows(ctx.db, 'order_items')).toBe(0);
    expect((await asAdmin({ url: `/api/admin/orders/${fresh}` })).statusCode).toBe(404);
    // Gone is gone: a second press finds nothing and returns nothing.
    expect((await remove(fresh)).statusCode).toBe(404);
    expect(await stockOf(ctx.db, id)).toBe(10);
  });

  it('leaves the stock alone for an order that was completed or cancelled', async () => {
    const id = await addProduct(ctx.db, { stockQty: 10 });
    const done = await placeOrderFor(id, 4);
    await setStatus(done, 'done');
    const cancelled = await placeOrderFor(id, 1);
    await setStatus(cancelled, 'cancelled');
    expect(await stockOf(ctx.db, id)).toBe(6);

    expect((await remove(done)).statusCode).toBe(200);
    expect((await remove(cancelled)).statusCode).toBe(200);

    // The four that were handed over stay handed over; the cancelled one had come back already.
    expect(await stockOf(ctx.db, id)).toBe(6);
    expect((await asAdmin({ url: '/api/admin/orders' })).json().orders).toEqual([]);
    expect((await remove(999)).statusCode).toBe(404);
  });

  it('removes a «Свой рецепт» request', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/custom-orders',
      payload: {
        recipeName: 'Пробные',
        base: 'Говядина',
        modifiers: [],
        spices: [],
        weightGrams: 2000,
        customerName: 'Тест',
        customerPhone: '+374 91 123456',
        customerTelegram: null,
        comment: null,
        website: '',
      },
    });
    const [request] = (await asAdmin({ url: '/api/admin/custom-orders' })).json();
    expect(request.publicNumber).toBe('R-0001');

    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/custom-orders/${request.id}` })).json()).toEqual({ ok: true });
    expect((await asAdmin({ url: '/api/admin/custom-orders' })).json()).toEqual([]);
    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/custom-orders/${request.id}` })).statusCode).toBe(404);
  });
});

describe('categories', () => {
  const BASE = ['pelmeni', 'vareniki', 'manty', 'khinkali', 'other'];
  const add = (name: unknown) => asAdmin({ method: 'POST', url: '/api/admin/categories', payload: { name } });

  it('starts with the five the shop always had, for buyers and for the admin', async () => {
    const forBuyers = (await ctx.app.inject({ url: '/api/categories' })).json();
    expect(forBuyers.map((c: { slug: string }) => c.slug)).toEqual(BASE);
    expect(forBuyers[0]).toEqual({ slug: 'pelmeni', name: 'Пельмени' });

    await addProduct(ctx.db, { category: 'manty' });
    await addProduct(ctx.db, { category: 'manty', isActive: false });
    const forAdmin = (await asAdmin({ url: '/api/admin/categories' })).json();
    expect(forAdmin.find((c: { slug: string }) => c.slug === 'manty')).toEqual({ slug: 'manty', name: 'Манты', productCount: 2 });
    expect(forAdmin.find((c: { slug: string }) => c.slug === 'other').productCount).toBe(0);
  });

  it('adds a category at the end, and a product can then be put into it', async () => {
    const created = await add('  Чебуреки ');
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ slug: 'chebureki', name: 'Чебуреки', productCount: 0 });

    const list = (await ctx.app.inject({ url: '/api/categories' })).json();
    expect(list.at(-1)).toEqual({ slug: 'chebureki', name: 'Чебуреки' });

    const product = await asAdmin({
      method: 'POST',
      url: '/api/admin/products',
      payload: { name: 'Чебурек с мясом', category: 'chebureki', priceAmd: 900 },
    });
    expect(product.statusCode).toBe(201);
    expect(product.json().product.category).toBe('chebureki');
    expect((await ctx.app.inject({ url: '/api/products' })).json()[0].category).toBe('chebureki');
  });

  it('gives a second category of the same name its own address, and one with no Latin letters a neutral one', async () => {
    expect((await add('Чебуреки')).json().slug).toBe('chebureki');
    expect((await add('Чебуреки')).json().slug).toBe('chebureki-2');
    expect((await add('★★★')).json().slug).toBe('category');
  });

  it('renames a category without touching its products', async () => {
    const id = await addProduct(ctx.db, { category: 'other' });
    const renamed = await asAdmin({ method: 'PATCH', url: '/api/admin/categories/other', payload: { name: 'Соусы' } });
    expect(renamed.json()).toEqual({ slug: 'other', name: 'Соусы', productCount: 1 });
    expect((await asAdmin({ url: `/api/admin/products/${id}` })).json().category).toBe('other');

    const missing = await asAdmin({ method: 'PATCH', url: '/api/admin/categories/nope', payload: { name: 'X' } });
    expect(missing.statusCode).toBe(404);
    // ctx.reset() does not rename categories back, so do it here.
    await asAdmin({ method: 'PATCH', url: '/api/admin/categories/other', payload: { name: 'Другое' } });
  });

  it('deletes an empty category only', async () => {
    await add('Чебуреки');
    const id = await addProduct(ctx.db, { category: 'chebureki' });
    const remove = () => asAdmin({ method: 'DELETE', url: '/api/admin/categories/chebureki' });

    const busy = await remove();
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error).toBe('has_products');

    await asAdmin({ method: 'PATCH', url: `/api/admin/products/${id}`, payload: { category: 'pelmeni' } });
    expect((await remove()).statusCode).toBe(200);
    expect((await remove()).statusCode).toBe(404);
    expect((await ctx.app.inject({ url: '/api/categories' })).json().map((c: { slug: string }) => c.slug)).toEqual(BASE);
  });

  it.each([
    ['an empty name', '   '],
    ['a name that is too long', 'я'.repeat(41)],
    ['something that is not text', 42],
  ])('refuses %s', async (_label, name) => {
    expect((await add(name)).statusCode).toBe(400);
  });

  it('refuses a product in a category that does not exist', async () => {
    const response = await asAdmin({
      method: 'POST',
      url: '/api/admin/products',
      payload: { name: 'Пицца', category: 'pizza', priceAmd: 1000 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('is managed by the admin only', async () => {
    expect((await ctx.app.inject({ url: '/api/admin/categories' })).statusCode).toBe(401);
    const anonymous = await ctx.app.inject({ method: 'POST', url: '/api/admin/categories', payload: { name: 'X' } });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('«Свой рецепт» requests', () => {
  const recipe = (overrides: Record<string, unknown> = {}) => ({
    recipeName: 'Пельмени Рафа',
    base: 'Куриное бедро',
    modifiers: ['Сливки', 'Чеснок'],
    spices: ['Паприка'],
    weightGrams: 2500,
    customerName: 'Тест',
    customerPhone: '+374 91 123456',
    customerTelegram: '@test_user',
    comment: 'Поострее',
    website: '',
    ...overrides,
  });
  const send = (body: Record<string, unknown>) => ctx.app.inject({ method: 'POST', url: '/api/custom-orders', payload: body });

  it('stores a recipe, tells the owner, and shows it in the admin with the count of new ones', async () => {
    const response = await send(recipe());
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ok: true, telegramLink: expect.stringMatching(/^https:\/\/t\.me\/test_shop_bot\?start=r[\w-]{22}$/) });
    expect(ctx.sent.customOrders).toEqual(['Пельмени Рафа']);

    const list = (await asAdmin({ url: '/api/admin/custom-orders' })).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      publicNumber: 'R-0001',
      status: 'new',
      recipeName: 'Пельмени Рафа',
      base: 'Куриное бедро',
      modifiers: ['Сливки', 'Чеснок'],
      spices: ['Паприка'],
      weightGrams: 2500,
      customerName: 'Тест',
      customerPhone: '+37491123456',
      customerTelegram: 'test_user',
      comment: 'Поострее',
    });
    expect((await asAdmin({ url: '/api/admin/today' })).json().newCustomOrders).toBe(1);

    const confirmed = await asAdmin({ method: 'PATCH', url: `/api/admin/custom-orders/${list[0].id}`, payload: { status: 'confirmed' } });
    expect(confirmed.json().status).toBe('confirmed');
    expect((await asAdmin({ url: '/api/admin/today' })).json().newCustomOrders).toBe(0);
    expect((await asAdmin({ method: 'PATCH', url: '/api/admin/custom-orders/999', payload: { status: 'done' } })).statusCode).toBe(404);
  });

  it('accepts a recipe with nothing but a base, and numbers requests on their own', async () => {
    expect((await send(recipe({ modifiers: [], spices: [], customerTelegram: null, comment: null, weightGrams: 2000 }))).statusCode).toBe(201);
    expect((await send(recipe({ recipeName: 'Вторые' }))).statusCode).toBe(201);
    const list = (await asAdmin({ url: '/api/admin/custom-orders' })).json();
    expect(list.map((o: { publicNumber: string }) => o.publicNumber)).toEqual(['R-0002', 'R-0001']);
    expect(list[1]).toMatchObject({ modifiers: [], spices: [], customerTelegram: null, comment: null });
    // Ordinary orders keep their own numbering.
    expect(await countRows(ctx.db, 'orders')).toBe(0);
  });

  it.each([
    ['less than two kilograms', { weightGrams: 1500 }],
    ['a weight between the steps', { weightGrams: 2300 }],
    ['more than the largest batch', { weightGrams: 30500 }],
    ['a base the shop does not offer', { base: 'Баранина' }],
    ['an addition the shop does not offer', { modifiers: ['Сливки', 'Трюфель'] }],
    ['a spice the shop does not offer', { spices: ['Шафран'] }],
    ['no name for the recipe', { recipeName: '   ' }],
    ['a name longer than fits on the package', { recipeName: 'я'.repeat(41) }],
    ['a bad phone', { customerPhone: '12345' }],
    ['a filled honeypot', { website: 'http://spam.example' }],
  ])('refuses %s', async (_label, patch) => {
    expect((await send(recipe(patch))).statusCode).toBe(400);
    expect((await asAdmin({ url: '/api/admin/custom-orders' })).json()).toEqual([]);
    expect(ctx.sent.customOrders).toEqual([]);
  });

  it('is switched off when the shop offers no bases', async () => {
    await ctx.db.execute(sql`UPDATE settings SET value = '' WHERE key = 'custom_bases'`);
    const response = await send(recipe());
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ ok: false, error: 'unavailable' });
  });

  it('shows the lists to buyers through the settings, and the list of requests to the admin only', async () => {
    const settings = (await ctx.app.inject({ url: '/api/settings' })).json();
    expect(settings.customBases.split('\n')).toEqual(['Говядина', 'Куриное бедро']);
    expect((await ctx.app.inject({ url: '/api/admin/custom-orders' })).statusCode).toBe(401);
  });
});

describe('the Telegram bot for buyers', () => {
  /** What Telegram sends to the webhook when someone writes `text` to the bot from chat `chatId`. */
  const say = (text: string, chatId = 777, secret: string | null = TEST_WEBHOOK_SECRET, type = 'private') =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      headers: secret === null ? {} : { 'x-telegram-bot-api-secret-token': secret },
      payload: { update_id: 1, message: { message_id: 1, text, chat: { id: chatId, type } } },
    });
  /** The start parameter in a link the shop handed out. */
  const startOf = (link: string) => new URL(link).searchParams.get('start')!;

  async function placeCourierOrder() {
    const id = await addProduct(ctx.db, { name: 'Пельмени', priceAmd: 2400, stockQty: 20 });
    const response = await postOrder(
      ctx.app,
      orderBody([{ productId: id, qty: 2 }], { deliveryMethod: 'courier', deliveryAddress: 'ул. Тестовая, 1' }),
    );
    expect(response.statusCode).toBe(201);
    return response.json().order as { telegramLink: string };
  }

  it('greets the buyer who follows the link with their order, and then reports every change of status', async () => {
    await ctx.db.execute(sql`INSERT INTO settings (key, value) VALUES ('telegram_contact', 'alyosha_personal')`);
    const order = await placeCourierOrder();
    expect((await asAdmin({ url: '/api/admin/orders/1' })).json().telegramLinked).toBe(false);

    expect((await say(`/start ${startOf(order.telegramLink)}`)).statusCode).toBe(200);
    expect(ctx.sent.buyer).toHaveLength(1);
    expect(ctx.sent.buyer[0]).toMatchObject({
      chatId: 777,
      button: { text: 'Написать Алёше', url: 'https://t.me/alyosha_personal' },
    });
    expect(ctx.sent.buyer[0]!.text).toContain('Мы получили ваш заказ');
    expect(ctx.sent.buyer[0]!.text).toContain('Пельмени × 2');
    // The buyer is never shown the order's number.
    expect(ctx.sent.buyer[0]!.text).not.toContain('A-0001');
    expect((await asAdmin({ url: '/api/admin/orders/1' })).json().telegramLinked).toBe(true);

    await setStatus(1, 'confirmed');
    expect(ctx.sent.buyer).toHaveLength(2);
    expect(ctx.sent.buyer[1]!.text).toContain('Заказ подтверждён');
    expect(ctx.sent.buyer[1]!.text).toContain('напишем или позвоним');
    expect(ctx.sent.buyer[1]!.text).toContain('о доставке');
    expect(ctx.sent.buyer[1]!.button?.url).toBe('https://t.me/alyosha_personal');

    // The same status again is not news.
    await setStatus(1, 'confirmed');
    expect(ctx.sent.buyer).toHaveLength(2);

    await setStatus(1, 'done');
    expect(ctx.sent.buyer[2]!.text).toContain('Заказ выполнен');
    await setStatus(1, 'cancelled');
    expect(ctx.sent.buyer[3]!.text).toContain('Заказ отменён');
    expect(ctx.sent.buyer.every((message) => message.chatId === 777)).toBe(true);
  });

  it('says nothing to a buyer who did not connect the bot, and speaks of pickup to one who collects', async () => {
    const id = await addProduct(ctx.db, { stockQty: 20 });
    const silent = await placeOrderFor(id, 1);
    await setStatus(silent, 'confirmed');
    expect(ctx.sent.buyer).toEqual([]);

    const pickup = await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    await say(`/start ${startOf(pickup.json().order.telegramLink)}`, 555);
    await setStatus(2, 'confirmed');
    expect(ctx.sent.buyer.at(-1)).toMatchObject({ chatId: 555 });
    expect(ctx.sent.buyer.at(-1)!.text).toContain('когда вы его заберёте');
  });

  it('does the same for a «Свой рецепт» request', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/custom-orders',
      payload: {
        recipeName: 'Острые', base: 'Говядина', modifiers: ['Чеснок'], spices: [], weightGrams: 2000,
        customerName: 'Тест', customerPhone: '+374 91 123456', customerTelegram: null, comment: null, website: '',
      },
    });
    await say(`/start ${startOf(response.json().telegramLink)}`, 888);
    expect(ctx.sent.buyer[0]).toMatchObject({ chatId: 888 });
    expect(ctx.sent.buyer[0]!.text).toContain('Мы получили ваш рецепт');
    expect(ctx.sent.buyer[0]!.text).toContain('«Острые» — 2 кг');

    const list = (await asAdmin({ url: '/api/admin/custom-orders' })).json();
    expect(list[0].telegramLinked).toBe(true);
    await asAdmin({ method: 'PATCH', url: `/api/admin/custom-orders/${list[0].id}`, payload: { status: 'confirmed' } });
    expect(ctx.sent.buyer[1]!.text).toContain('Рецепт «Острые» подтверждён');
    expect(ctx.sent.buyer[1]!.chatId).toBe(888);
  });

  it('explains itself to someone who just opens the bot, and does not accept a made-up order', async () => {
    await say('/start');
    await say('привет');
    expect(ctx.sent.buyer.map((message) => message.text)).toEqual([expect.stringContaining('Это бот'), expect.stringContaining('Это бот')]);
    // Without the owner's own Telegram in the settings there is nowhere for the button to lead.
    expect(ctx.sent.buyer[0]!.button).toBeUndefined();

    await say('/start oAAAAAAAAAAAAAAAAAAAAAA');
    await say('/start not-a-token');
    expect(ctx.sent.buyer.slice(2).map((message) => message.text)).toEqual([
      expect.stringContaining('Не нашли такой заказ'),
      expect.stringContaining('Не нашли такой заказ'),
    ]);
  });

  it('tells the owner the number of his chat when he asks for it, in a group too', async () => {
    await say('/chatid', 4242);
    expect(ctx.sent.buyer).toEqual([{ chatId: 4242, text: expect.stringContaining('4242'), button: undefined }]);

    // A group where the owner and the developer both see the orders: its number is negative.
    await say('/chatid@test_shop_bot', -1001234, TEST_WEBHOOK_SECRET, 'supergroup');
    expect(ctx.sent.buyer[1]).toEqual({ chatId: -1001234, text: expect.stringContaining('-1001234'), button: undefined });
  });

  it('listens only to Telegram, and only in private chats', async () => {
    const order = await placeCourierOrder();
    const start = `/start ${startOf(order.telegramLink)}`;

    expect((await say(start, 777, 'wrong-secret')).statusCode).toBe(403);
    expect((await say(start, 777, null)).statusCode).toBe(403);
    expect((await say(start, -100123, TEST_WEBHOOK_SECRET, 'group')).statusCode).toBe(200);
    expect(ctx.sent.buyer).toEqual([]);
    expect((await asAdmin({ url: '/api/admin/orders/1' })).json().telegramLinked).toBe(false);

    // A body that is not a message at all is accepted and ignored.
    const odd = await ctx.app.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': TEST_WEBHOOK_SECRET },
      payload: { update_id: 2, edited_message: {} },
    });
    expect(odd.statusCode).toBe(200);
  });

  it('offers no link and has no webhook when the bot is not connected', async () => {
    const app = await ctx.buildApp({ buyerBot: null });
    const id = await addProduct(ctx.db, { stockQty: 5 });
    const response = await postOrder(app, orderBody([{ productId: id, qty: 1 }]));
    expect(response.json().order.telegramLink).toBeNull();
    const webhook = await app.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': TEST_WEBHOOK_SECRET },
      payload: {},
    });
    expect(webhook.statusCode).toBe(404);
  });
});

describe('the admin side of the Telegram bot', () => {
  const webhook = (payload: Record<string, unknown>) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': TEST_WEBHOOK_SECRET },
      payload: { update_id: 1, ...payload },
    });
  /** Someone presses the button carrying `data` under message 50 in chat `chatId`. */
  const press = (data: string, chatId = TEST_ADMIN_CHAT) =>
    webhook({ callback_query: { id: 'cb-1', data, message: { message_id: 50, chat: { id: chatId } } } });
  const say = (text: string, chatId = TEST_ADMIN_CHAT, type = 'private') =>
    webhook({ message: { message_id: 1, text, chat: { id: chatId, type } } });
  const actions = (keyboard: Keyboard | undefined) =>
    (keyboard ?? []).flat().map((button) => ('data' in button ? `${button.text} → ${button.data}` : `${button.text} → ${button.url}`));

  it('runs an order from the buttons under it: confirm, complete, cancel, bring back', async () => {
    const id = await addProduct(ctx.db, { name: 'Пельмени', priceAmd: 2400, stockQty: 10 });
    const order = await placeOrderFor(id, 3);
    expect(await stockOf(ctx.db, id)).toBe(7);

    expect((await press(`o:${order}:c`)).statusCode).toBe(200);
    expect((await asAdmin({ url: `/api/admin/orders/${order}` })).json().status).toBe('confirmed');
    expect(ctx.sent.answers).toEqual([{ text: 'Заказ A-0001 подтверждён.', alert: false }]);
    // The message under which the button was pressed is rewritten: new status, new buttons.
    expect(ctx.sent.edits).toHaveLength(1);
    expect(ctx.sent.edits[0]).toMatchObject({ chatId: TEST_ADMIN_CHAT, messageId: 50 });
    expect(ctx.sent.edits[0]!.text).toContain('Заказ A-0001');
    expect(ctx.sent.edits[0]!.text).toContain('Подтверждён');
    expect(actions(ctx.sent.edits[0]!.keyboard)).toEqual([
      `🎉 Выполнен → o:${order}:d`,
      `❌ Отменить → o:${order}:x`,
      `Открыть в админке → https://shop.test/admin/orders/${order}`,
    ]);

    // Cancelling from Telegram returns the stock, exactly like the admin panel.
    await press(`o:${order}:x`);
    expect(await stockOf(ctx.db, id)).toBe(10);
    expect(actions(ctx.sent.edits[1]!.keyboard)[0]).toBe(`↩️ Вернуть в новые → o:${order}:n`);

    await press(`o:${order}:n`);
    expect(await stockOf(ctx.db, id)).toBe(7);
    await press(`o:${order}:d`);
    expect((await asAdmin({ url: `/api/admin/orders/${order}` })).json().status).toBe('done');
    // A finished order has nothing left to press but the link to the admin panel.
    expect(actions(ctx.sent.edits.at(-1)!.keyboard)).toEqual([`Открыть в админке → https://shop.test/admin/orders/${order}`]);
  });

  it('tells the buyer who connected the bot when the owner presses a button', async () => {
    const id = await addProduct(ctx.db, { stockQty: 10 });
    const placed = await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    const start = new URL(placed.json().order.telegramLink).searchParams.get('start')!;
    await say(`/start ${start}`, 777);
    ctx.sent.buyer.length = 0;

    await press('o:1:c');
    expect(ctx.sent.buyer).toHaveLength(1);
    expect(ctx.sent.buyer[0]).toMatchObject({ chatId: 777 });
    expect(ctx.sent.buyer[0]!.text).toContain('Заказ подтверждён');
    expect(ctx.sent.edits[0]!.text).toContain('Покупатель подключил бота');
  });

  it('refuses to bring back a cancelled order whose items have been sold since, and says why', async () => {
    const id = await addProduct(ctx.db, { name: 'Манты', stockQty: 2 });
    const order = await placeOrderFor(id, 2);
    await press(`o:${order}:x`);
    await placeOrderFor(id, 2);
    ctx.sent.answers.length = 0;

    await press(`o:${order}:n`);
    expect(ctx.sent.answers).toEqual([{ text: 'Не хватает товара на складе: Манты (есть 0).', alert: true }]);
    expect((await asAdmin({ url: `/api/admin/orders/${order}` })).json().status).toBe('cancelled');
  });

  it('lets nobody but an admin chat press the buttons', async () => {
    const id = await addProduct(ctx.db, { stockQty: 5 });
    const order = await placeOrderFor(id, 1);

    await press(`o:${order}:x`, 777);
    expect(ctx.sent.answers).toEqual([{ text: 'Эти кнопки только для администратора магазина.', alert: true }]);
    expect((await asAdmin({ url: `/api/admin/orders/${order}` })).json().status).toBe('new');
    expect(await stockOf(ctx.db, id)).toBe(4);
    expect(ctx.sent.edits).toEqual([]);

    // Nor does a button that is not one of ours do anything, even from the admin chat.
    await press('o:1:hack');
    await press('o:999:c');
    expect(ctx.sent.answers.slice(1)).toEqual([
      { text: 'Эта кнопка устарела.', alert: true },
      { text: 'Такого заказа больше нет.', alert: true },
    ]);
    expect((await asAdmin({ url: `/api/admin/orders/${order}` })).json().status).toBe('new');
  });

  it('runs a «Свой рецепт» request the same way', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/custom-orders',
      payload: {
        recipeName: 'Острые', base: 'Говядина', modifiers: [], spices: [], weightGrams: 2000,
        customerName: 'Тест', customerPhone: '+374 91 123456', customerTelegram: null, comment: null, website: '',
      },
    });
    expect(response.statusCode).toBe(201);

    await press('r:1:c');
    expect((await asAdmin({ url: '/api/admin/custom-orders' })).json()[0].status).toBe('confirmed');
    expect(ctx.sent.answers).toEqual([{ text: 'Рецепт R-0001 подтверждён.', alert: false }]);
    expect(actions(ctx.sent.edits[0]!.keyboard)).toEqual([
      '🎉 Выполнен → r:1:d',
      '❌ Отменить → r:1:x',
      'Открыть в админке → https://shop.test/admin/recipes',
    ]);
  });

  it('lists the open orders on /orders, each with its buttons, and greets an admin as an admin', async () => {
    await say('/orders');
    expect(ctx.sent.buyer.map((message) => message.text)).toEqual(['Открытых заказов нет.']);

    const id = await addProduct(ctx.db, { stockQty: 20 });
    const first = await placeOrderFor(id, 1);
    const second = await placeOrderFor(id, 1);
    const third = await placeOrderFor(id, 1);
    await setStatus(first, 'confirmed');
    await setStatus(third, 'done');
    ctx.sent.buyer.length = 0;

    // In a group Telegram writes the command with the bot's name.
    await say('/orders@test_shop_bot');
    expect(ctx.sent.buyer.map((message) => message.chatId)).toEqual([TEST_ADMIN_CHAT, TEST_ADMIN_CHAT]);
    expect(ctx.sent.buyer.map((message) => actions(message.keyboard)[0])).toEqual([
      `🎉 Выполнен → o:${first}:d`,
      `✅ Подтвердить → o:${second}:c`,
    ]);

    ctx.sent.buyer.length = 0;
    await say('/start');
    expect(ctx.sent.buyer[0]!.text).toContain('чат администратора');
    // The same command from anyone else is just a stranger opening the bot.
    await say('/orders', 777);
    expect(ctx.sent.buyer[1]).toMatchObject({ chatId: 777, text: expect.stringContaining('Это бот') });
  });
});

describe('order statistics', () => {
  /** Moves an order to a moment of our choosing. */
  async function placedAt(orderId: number, iso: string) {
    await ctx.db.execute(sql`UPDATE orders SET created_at = ${iso}::timestamptz WHERE id = ${orderId}`);
  }
  const stats = (query: string) => asAdmin({ url: `/api/admin/orders/stats?${query}` });

  it('counts a day and a run of days on the shop clock, with cancelled orders apart', async () => {
    const pelmeni = await addProduct(ctx.db, { name: 'Пельмени', priceAmd: 2000, stockQty: 50 });
    const manty = await addProduct(ctx.db, { name: 'Манты', priceAmd: 3000, stockQty: 50 });

    // 9 October in Yerevan (UTC+4): one order at noon, one at 23:30, one cancelled.
    const noon = await placeOrderFor(pelmeni, 2);
    await placedAt(noon, '2026-10-09T12:00:00+04:00');
    const lateEvening = await placeOrderFor(manty, 1);
    await placedAt(lateEvening, '2026-10-09T23:30:00+04:00');
    const cancelled = await placeOrderFor(pelmeni, 5);
    await placedAt(cancelled, '2026-10-09T15:00:00+04:00');
    await setStatus(cancelled, 'cancelled');
    // 10 October at 00:30 in Yerevan is still the 9th in UTC: it must count for the 10th.
    const afterMidnight = await placeOrderFor(pelmeni, 1);
    await placedAt(afterMidnight, '2026-10-10T00:30:00+04:00');
    await setStatus(afterMidnight, 'done');
    const courier = await postOrder(
      ctx.app,
      orderBody([{ productId: manty, qty: 2 }], { deliveryMethod: 'courier', deliveryAddress: 'ул. Тестовая, 1' }),
    );
    expect(courier.statusCode).toBe(201);
    await placedAt(5, '2026-10-10T18:00:00+04:00');

    const day = (await stats('from=2026-10-09&to=2026-10-09')).json();
    expect(day).toMatchObject({
      from: '2026-10-09',
      to: '2026-10-09',
      placed: { count: 3, totalAmd: 17000 },
      kept: { count: 2, totalAmd: 7000 },
      cancelled: { count: 1, totalAmd: 10000 },
      pickupCount: 2,
      courierCount: 0,
      products: [
        { productId: pelmeni, name: 'Пельмени', qty: 2, totalAmd: 4000 },
        { productId: manty, name: 'Манты', qty: 1, totalAmd: 3000 },
      ],
      days: [{ date: '2026-10-09', count: 2, cancelledCount: 1, totalAmd: 7000 }],
    });
    expect(day.byStatus).toMatchObject({ new: { count: 2 }, confirmed: { count: 0 }, done: { count: 0 }, cancelled: { count: 1 } });

    const both = (await stats('from=2026-10-09&to=2026-10-10')).json();
    expect(both).toMatchObject({
      placed: { count: 5 },
      // The courier order adds the test settings' fee of 1 000 to its 6 000 of goods.
      kept: { count: 4, totalAmd: 7000 + 2000 + 7000 },
      cancelled: { count: 1 },
      pickupCount: 3,
      courierCount: 1,
      days: [
        { date: '2026-10-09', count: 2, cancelledCount: 1, totalAmd: 7000 },
        { date: '2026-10-10', count: 2, cancelledCount: 0, totalAmd: 9000 },
      ],
    });
    expect(both.products).toEqual([
      { productId: pelmeni, name: 'Пельмени', qty: 3, totalAmd: 6000 },
      { productId: manty, name: 'Манты', qty: 3, totalAmd: 9000 },
    ]);
    expect(both.byStatus.done).toEqual({ count: 1, totalAmd: 2000 });

    const empty = (await stats('from=2026-10-01&to=2026-10-02')).json();
    expect(empty).toMatchObject({ placed: { count: 0, totalAmd: 0 }, products: [], days: [] });
  });

  it.each([
    ['no dates', ''],
    ['a date that is not one', 'from=2026-02-30&to=2026-03-01'],
    ['another format', 'from=09.10.2026&to=09.10.2026'],
    ['an end before the start', 'from=2026-10-10&to=2026-10-09'],
    ['more than a year at once', 'from=2025-01-01&to=2026-10-09'],
  ])('refuses %s', async (_name, query) => {
    expect((await stats(query)).statusCode).toBe(400);
  });

  it('is for the admin only', async () => {
    const response = await ctx.app.inject({ url: '/api/admin/orders/stats?from=2026-10-09&to=2026-10-09' });
    expect(response.statusCode).toBe(401);
  });
});

describe('stock requests and settings', () => {
  it('groups open requests by product and lets each be marked', async () => {
    const a = await addProduct(ctx.db, { name: 'Манты', stockQty: 0, sortOrder: 10 });
    const b = await addProduct(ctx.db, { name: 'Вареники', stockQty: 0, sortOrder: 20 });
    const request = (productId: number, name: string) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/stock-requests',
        payload: { productId, name, phone: '091 123456', telegram: '@some_user' },
      });
    await request(a, 'Анна');
    await request(b, 'Борис');
    await request(a, 'Вера');

    const groups = (await asAdmin({ url: '/api/admin/stock-requests' })).json();
    expect(groups.map((g: { product: { name: string }; requests: { name: string }[] }) => [g.product.name, g.requests.map((r) => r.name)])).toEqual([
      ['Манты', ['Анна', 'Вера']],
      ['Вареники', ['Борис']],
    ]);
    expect(groups[0].requests[0]).toMatchObject({ phone: '+37491123456', telegram: 'some_user', status: 'open' });

    const anna = groups[0].requests[0].id;
    await asAdmin({ method: 'PATCH', url: `/api/admin/stock-requests/${anna}`, payload: { status: 'notified' } });

    const open = (await asAdmin({ url: '/api/admin/stock-requests' })).json();
    expect(open[0].requests.map((r: { name: string }) => r.name)).toEqual(['Вера']);
    const all = (await asAdmin({ url: '/api/admin/stock-requests?all=1' })).json();
    expect(all[0].requests).toHaveLength(2);
    expect(await countRows(ctx.db, 'stock_requests')).toBe(3);
  });

  const validSettings = {
    aboutText: 'О нас',
    deliveryText: 'Доставка',
    contactsText: 'Контакты',
    pickupAddress: 'Ереван, ул. Абовяна, 1',
    courierFeeAmd: 700,
    freeDeliveryFromAmd: 8000,
    deliveryNote: 'Заказы после 15:00 — на следующий день',
    heroTitle: 'Заголовок',
    heroSubtitle: 'Подзаголовок',
    phonePublic: '+374 91 123456',
    telegramPublic: '@alyosha_pelmenych',
    instagramUrl: 'https://instagram.com/alyosha',
    tiktokUrl: '',
    telegramContact: '@alyosha_personal',
    customBases: 'Говядина',
    customModifiers: '',
    customSpices: '',
  };

  it('saves the settings, and the shop uses them straight away', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2000, stockQty: 50 });

    const saved = await asAdmin({ method: 'PUT', url: '/api/admin/settings', payload: validSettings });
    expect(saved.statusCode).toBe(200);

    const shown = (await ctx.app.inject({ url: '/api/settings' })).json();
    // Telegram names are stored without the @.
    expect(shown).toEqual({ ...validSettings, telegramPublic: 'alyosha_pelmenych', telegramContact: 'alyosha_personal' });

    // The new fee and threshold apply to the next order.
    const courier = { deliveryMethod: 'courier' as const, deliveryAddress: 'ул. Тестовая, 1' };
    const small = await postOrder(ctx.app, orderBody([{ productId: id, qty: 3 }], courier));
    expect(small.json().order).toMatchObject({ deliveryFeeAmd: 700, totalAmd: 6700 });
    const large = await postOrder(ctx.app, orderBody([{ productId: id, qty: 4 }], courier));
    expect(large.json().order).toMatchObject({ deliveryFeeAmd: 0, totalAmd: 8000 });
  });

  it.each([
    ['a negative fee', { courierFeeAmd: -5 }, 'courierFeeAmd'],
    ['a fee that is not a number', { courierFeeAmd: 'много' }, 'courierFeeAmd'],
    ['a link that is not https', { instagramUrl: 'javascript:alert(1)' }, 'instagramUrl'],
    ['a bad Telegram name', { telegramPublic: 'two words' }, 'telegramPublic'],
  ])('rejects %s and says which field', async (_label, change, field) => {
    await asAdmin({ method: 'PUT', url: '/api/admin/settings', payload: validSettings });

    const response = await asAdmin({ method: 'PUT', url: '/api/admin/settings', payload: { ...validSettings, ...change } });

    expect(response.statusCode).toBe(400);
    expect(response.json().fields).toEqual([field]);
    expect((await ctx.app.inject({ url: '/api/settings' })).json().courierFeeAmd).toBe(700);
  });
});

describe('a forgotten admin password', () => {
  const NEW_PASSWORD = 'a-brand-new-password';
  // The shop of these tests gets a login of its own: a new password must not leak into the other tests.
  let auth: AdminAuth;
  let app: FastifyInstance;

  beforeEach(async () => {
    auth = { ...TEST_ADMIN };
    app = await ctx.buildApp({ admin: auth });
  });

  const say = (text: string, chatId = TEST_ADMIN_CHAT) =>
    app.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': TEST_WEBHOOK_SECRET },
      payload: { update_id: 1, message: { message_id: 1, text, chat: { id: chatId, type: 'private' } } },
    });
  const login = (password: string) => app.inject({ method: 'POST', url: '/api/admin/login', payload: { password } });
  const reset = (token: string, password: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/api/admin/password-reset', payload: { token, password }, headers });
  /** Asks the bot for a link, as the owner would, and returns the secret in it. */
  async function askForLink(): Promise<string> {
    ctx.sent.buyer.length = 0;
    expect((await say('/password')).statusCode).toBe(200);
    // The address stands in the text itself, on a line of its own, with no button to press.
    const link = /^https:\/\/shop\.test\/admin\/reset#([\w-]+)$/m.exec(ctx.sent.buyer[0]!.text);
    expect(link).not.toBeNull();
    expect(ctx.sent.buyer[0]!.keyboard).toBeUndefined();
    return link![1]!;
  }

  it('sends the link to an admin chat only', async () => {
    const token = await askForLink();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(ctx.sent.buyer[0]!.chatId).toBe(TEST_ADMIN_CHAT);
    expect(ctx.sent.buyer[0]!.text).toContain('15 минут');

    // Anybody else is a buyer to the bot: they get its greeting and no way to the password.
    ctx.sent.buyer.length = 0;
    await say('/password', 555);
    expect(ctx.sent.buyer).toHaveLength(1);
    expect(ctx.sent.buyer[0]!.chatId).toBe(555);
    expect(JSON.stringify(ctx.sent.buyer[0])).not.toContain('/admin/reset');
    // And the link the owner holds still works.
    expect((await reset(token, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('sets the new password once, signs everyone out and tells the admin chats', async () => {
    const before = adminCookie(auth);
    const token = await askForLink();
    ctx.sent.buyer.length = 0;

    const saved = await reset(token, NEW_PASSWORD);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ ok: true });

    expect((await login(TEST_ADMIN_PASSWORD)).statusCode).toBe(401);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
    // A device that was signed in with the old password is not any more.
    expect((await app.inject({ url: '/api/admin/me', headers: { cookie: before } })).statusCode).toBe(401);
    expect(ctx.sent.buyer).toHaveLength(1);
    expect(ctx.sent.buyer[0]).toMatchObject({ chatId: TEST_ADMIN_CHAT });
    expect(ctx.sent.buyer[0]!.text).toContain('Пароль от админки изменён');

    // The same link again does nothing.
    const again = await reset(token, 'another-new-password');
    expect(again.statusCode).toBe(400);
    expect(again.json()).toEqual({ ok: false, error: 'bad_link' });
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('refuses a made-up, replaced or expired link and a short password', async () => {
    expect((await reset('x'.repeat(43), NEW_PASSWORD)).json()).toEqual({ ok: false, error: 'bad_link' });

    // Asking again makes the first link useless.
    const first = await askForLink();
    const second = await askForLink();
    expect((await reset(first, NEW_PASSWORD)).statusCode).toBe(400);

    // Too short: refused, and the link is not spent on it.
    expect((await reset(second, 'short')).json()).toEqual({ ok: false, error: 'invalid' });
    expect((await login(TEST_ADMIN_PASSWORD)).statusCode).toBe(200);

    // Not from the shop's own pages.
    expect((await reset(second, NEW_PASSWORD, { origin: 'https://evil.example' })).statusCode).toBe(403);

    // Sixteen minutes later.
    await ctx.db.execute(sql`UPDATE admin_password SET reset_expires_at = now() - interval '1 minute'`);
    expect((await reset(second, NEW_PASSWORD)).json()).toEqual({ ok: false, error: 'bad_link' });
    expect((await login(TEST_ADMIN_PASSWORD)).statusCode).toBe(200);

    // What is stored opens nothing: neither the secret nor a password.
    const stored = await ctx.db.execute<{ reset_token_hash: string; password_hash: string | null }>(
      sql`SELECT reset_token_hash, password_hash FROM admin_password`,
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.reset_token_hash).not.toBe(second);
    expect(stored.rows[0]!.password_hash).toBeNull();
  });

  it('keeps the new password across a restart, until ADMIN_PASSWORD_HASH itself is changed', async () => {
    expect((await reset(await startPasswordReset(ctx.db), NEW_PASSWORD)).statusCode).toBe(200);

    // The server starts again with the same ADMIN_PASSWORD_HASH: the password from the bot stands.
    const restarted: AdminAuth = { ...TEST_ADMIN };
    await applyStoredPassword(ctx.db, restarted);
    expect(restarted.passwordHash).toBe(auth.passwordHash);
    expect(restarted.passwordHash).not.toBe(TEST_ADMIN.passwordHash);

    // Somebody puts a new hash into the variable: that is the password now, and the stored one is dropped.
    const replaced: AdminAuth = { ...TEST_ADMIN, passwordHash: 'hash-from-the-server', configuredHash: 'hash-from-the-server' };
    await applyStoredPassword(ctx.db, replaced);
    expect(replaced.passwordHash).toBe('hash-from-the-server');
    const stored = await ctx.db.execute<{ password_hash: string | null }>(sql`SELECT password_hash FROM admin_password`);
    expect(stored.rows[0]!.password_hash).toBeNull();
  });

  it('needs the admin to be switched on', async () => {
    const off = await ctx.buildApp({ admin: null });
    ctx.sent.buyer.length = 0;
    await off.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': TEST_WEBHOOK_SECRET },
      payload: { update_id: 1, message: { message_id: 1, text: '/password', chat: { id: TEST_ADMIN_CHAT, type: 'private' } } },
    });
    expect(ctx.sent.buyer[0]!.text).toContain('выключена');
    expect(ctx.sent.buyer[0]!.button).toBeUndefined();
    expect((await off.inject({ method: 'POST', url: '/api/admin/password-reset', payload: {} })).statusCode).toBe(503);
  });
});
