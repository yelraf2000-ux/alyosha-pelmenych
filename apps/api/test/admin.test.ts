import { sql } from 'drizzle-orm';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_TTL_SECONDS } from '../src/auth';
import {
  addProduct,
  adminCookie,
  countRows,
  createTestContext,
  orderBody,
  postOrder,
  stockOf,
  TEST_ADMIN,
  TEST_ADMIN_PASSWORD,
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
      totals: [
        { productId: a, name: 'Пельмени', qty: 5 },
        { productId: b, name: 'Манты', qty: 4 },
      ],
    });
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
  };

  it('saves the settings, and the shop uses them straight away', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2000, stockQty: 50 });

    const saved = await asAdmin({ method: 'PUT', url: '/api/admin/settings', payload: validSettings });
    expect(saved.statusCode).toBe(200);

    const shown = (await ctx.app.inject({ url: '/api/settings' })).json();
    expect(shown).toEqual({ ...validSettings, telegramPublic: 'alyosha_pelmenych' });

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
