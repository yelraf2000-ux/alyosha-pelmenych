import { shopToday, type PromoCodeInput } from '@alyosha/shared';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addProduct, adminCookie, createTestContext, orderBody, postOrder, stockOf, type TestContext } from './helpers';

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

function asAdmin(options: InjectOptions) {
  return ctx.app.inject({ ...options, headers: { ...options.headers, cookie: adminCookie() } });
}

const promo = (overrides: Partial<PromoCodeInput> = {}): PromoCodeInput => ({
  code: 'pelmeni20',
  kind: 'percent',
  value: 20,
  categories: [],
  productIds: [],
  maxUses: null,
  validUntil: null,
  isActive: true,
  ...overrides,
});

async function createPromo(overrides: Partial<PromoCodeInput> = {}) {
  const response = await asAdmin({ method: 'POST', url: '/api/admin/promo-codes', payload: promo(overrides) });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: number; code: string };
}

const check = (code: string, items: { productId: number; qty: number }[]) =>
  ctx.app.inject({ method: 'POST', url: '/api/promo-codes/check', payload: { code, items } });

const yesterday = () => new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const nextYear = () => `${new Date().getFullYear() + 1}-12-31`;

describe('promo codes in the admin', () => {
  it('creates, lists, rewrites and deletes a code, kept in upper case', async () => {
    const created = await createPromo({ code: '  pelmeni20 ' });
    expect(created).toMatchObject({ code: 'PELMENI20', kind: 'percent', value: 20, uses: 0, discountGivenAmd: 0, isActive: true });

    const list = (await asAdmin({ url: '/api/admin/promo-codes' })).json();
    expect(list).toHaveLength(1);

    const rewritten = await asAdmin({
      method: 'PUT',
      url: `/api/admin/promo-codes/${created.id}`,
      payload: promo({ code: 'ПЕЛЬМЕНИ500', kind: 'amount', value: 500, maxUses: 10, validUntil: nextYear() }),
    });
    expect(rewritten.statusCode).toBe(200);
    expect(rewritten.json()).toMatchObject({ code: 'ПЕЛЬМЕНИ500', kind: 'amount', value: 500, maxUses: 10, validUntil: nextYear() });

    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/promo-codes/${created.id}` })).json()).toEqual({ ok: true });
    expect((await asAdmin({ url: '/api/admin/promo-codes' })).json()).toEqual([]);
    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/promo-codes/${created.id}` })).statusCode).toBe(404);
  });

  it('refuses a code that is taken, a percentage over 100 and a code with spaces', async () => {
    await createPromo();
    const taken = await asAdmin({ method: 'POST', url: '/api/admin/promo-codes', payload: promo({ code: 'Pelmeni20' }) });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ ok: false, error: 'code_taken' });

    for (const bad of [promo({ code: 'OTHER', value: 120 }), promo({ code: 'two words' }), promo({ code: 'ab' })]) {
      expect((await asAdmin({ method: 'POST', url: '/api/admin/promo-codes', payload: bad })).statusCode).toBe(400);
    }
    // A fixed amount may well be more than 100.
    expect((await asAdmin({ method: 'POST', url: '/api/admin/promo-codes', payload: promo({ code: 'MINUS500', kind: 'amount', value: 500 }) })).statusCode).toBe(201);
  });

  it('needs a session', async () => {
    for (const route of [
      { method: 'GET', url: '/api/admin/promo-codes' },
      { method: 'POST', url: '/api/admin/promo-codes', payload: promo() },
      { method: 'PUT', url: '/api/admin/promo-codes/1', payload: promo() },
      { method: 'DELETE', url: '/api/admin/promo-codes/1' },
    ] as InjectOptions[]) {
      expect((await ctx.app.inject(route)).statusCode).toBe(401);
    }
  });
});

describe('promo codes at checkout', () => {
  it('works out the discount on the goods it covers only, whatever the case it is typed in', async () => {
    const pelmeni = await addProduct(ctx.db, { category: 'pelmeni', priceAmd: 2500 });
    const manty = await addProduct(ctx.db, { category: 'manty', priceAmd: 3000 });
    await createPromo({ code: 'PELMENI20', categories: ['pelmeni'] });
    await createPromo({ code: 'MINUS1000', kind: 'amount', value: 1000, productIds: [manty] });
    await createPromo({ code: 'ALL10', value: 10 });

    // 20% of the two packs of пельмени only: 5000 → 1000.
    expect((await check('pelmeni20', [{ productId: pelmeni, qty: 2 }, { productId: manty, qty: 1 }])).json()).toEqual({
      ok: true,
      code: 'PELMENI20',
      discountAmd: 1000,
    });
    // A fixed amount, but never more than the goods it covers cost.
    expect((await check('minus1000', [{ productId: manty, qty: 1 }])).json().discountAmd).toBe(1000);
    // A percentage of an odd sum is rounded down: 10% of 2500 + 3000.
    expect((await check('ALL10', [{ productId: pelmeni, qty: 1 }, { productId: manty, qty: 1 }])).json().discountAmd).toBe(550);
    // The code exists, but nothing in this cart is what it is for.
    expect((await check('PELMENI20', [{ productId: manty, qty: 3 }])).json()).toEqual({ ok: false, error: 'not_applicable' });
  });

  it('caps a fixed amount at what the covered goods cost', async () => {
    const cheap = await addProduct(ctx.db, { priceAmd: 400 });
    await createPromo({ code: 'MINUS1000', kind: 'amount', value: 1000 });
    expect((await check('MINUS1000', [{ productId: cheap, qty: 1 }])).json().discountAmd).toBe(400);
  });

  it('says why a code does not work: unknown, switched off, expired, used up', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2000 });
    const items = [{ productId: id, qty: 1 }];
    await createPromo({ code: 'OFF', isActive: false });
    await createPromo({ code: 'OLD', validUntil: yesterday() });
    await createPromo({ code: 'TODAY', validUntil: nextYear() });
    await createPromo({ code: 'ONCE', maxUses: 1 });

    expect((await check('NOPE', items)).json()).toEqual({ ok: false, error: 'not_found' });
    expect((await check('OFF', items)).json()).toEqual({ ok: false, error: 'not_found' });
    expect((await check('OLD', items)).json()).toEqual({ ok: false, error: 'expired' });
    expect((await check('TODAY', items)).json().ok).toBe(true);

    expect((await check('ONCE', items)).json().ok).toBe(true);
    expect((await postOrder(ctx.app, orderBody(items, { promoCode: 'once' }))).statusCode).toBe(201);
    expect((await check('ONCE', items)).json()).toEqual({ ok: false, error: 'used_up' });
  });

  it('puts the discount into the order, its total, the admin and the owner’s message', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2500, stockQty: 10 });
    await createPromo({ code: 'PELMENI20', value: 20 });

    const placed = await postOrder(ctx.app, orderBody([{ productId: id, qty: 2 }], { promoCode: 'pelmeni20' }));
    expect(placed.statusCode).toBe(201);
    expect(placed.json().order).toMatchObject({ itemsTotalAmd: 5000, discountAmd: 1000, promoCode: 'PELMENI20', deliveryFeeAmd: 0, totalAmd: 4000 });
    expect(await stockOf(ctx.db, id)).toBe(8);

    const [summary] = (await asAdmin({ url: '/api/admin/orders' })).json().orders;
    const order = (await asAdmin({ url: `/api/admin/orders/${summary.id}` })).json();
    expect(order).toMatchObject({ discountAmd: 1000, promoCode: 'PELMENI20', totalAmd: 4000 });

    const [listed] = (await asAdmin({ url: '/api/admin/promo-codes' })).json();
    expect(listed).toMatchObject({ uses: 1, discountGivenAmd: 1000 });
  });

  it('keeps free delivery by the goods before the discount', async () => {
    // The tests' shop: courier 1000, free from 10 000.
    const id = await addProduct(ctx.db, { priceAmd: 5000 });
    await createPromo({ code: 'HALF', value: 50 });

    const placed = await postOrder(
      ctx.app,
      orderBody([{ productId: id, qty: 2 }], { promoCode: 'HALF', deliveryMethod: 'courier', deliveryAddress: 'ул. Абовяна, 1' }),
    );
    expect(placed.json().order).toMatchObject({ itemsTotalAmd: 10000, discountAmd: 5000, deliveryFeeAmd: 0, totalAmd: 5000 });
  });

  it('refuses the order, and moves no stock, when the code has stopped working', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2000, stockQty: 5 });
    await createPromo({ code: 'ONCE', maxUses: 1 });
    expect((await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }], { promoCode: 'ONCE' }))).statusCode).toBe(201);

    const second = await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }], { promoCode: 'ONCE' }));
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ ok: false, error: 'promo', problem: 'used_up' });
    expect(await stockOf(ctx.db, id)).toBe(4);
  });

  it('gives a use back when its order is cancelled', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2000 });
    await createPromo({ code: 'ONCE', maxUses: 1 });
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }], { promoCode: 'ONCE' }));
    const [summary] = (await asAdmin({ url: '/api/admin/orders' })).json().orders;

    await asAdmin({ method: 'PATCH', url: `/api/admin/orders/${summary.id}`, payload: { status: 'cancelled' } });
    expect((await check('ONCE', [{ productId: id, qty: 1 }])).json().ok).toBe(true);
  });

  it('lets two orders race for the last use and serves only one', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2000, stockQty: 10 });
    await createPromo({ code: 'ONCE', maxUses: 1 });
    const both = await Promise.all([
      postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }], { promoCode: 'ONCE' })),
      postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }], { promoCode: 'ONCE' })),
    ]);
    expect(both.map((response) => response.statusCode).sort()).toEqual([201, 409]);
  });

  it('keeps the code’s text and the discount on an order after the code is deleted', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2000 });
    const created = await createPromo({ code: 'GONE', kind: 'amount', value: 300 });
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }], { promoCode: 'GONE' }));
    await asAdmin({ method: 'DELETE', url: `/api/admin/promo-codes/${created.id}` });

    const [summary] = (await asAdmin({ url: '/api/admin/orders' })).json().orders;
    expect((await asAdmin({ url: `/api/admin/orders/${summary.id}` })).json()).toMatchObject({ promoCode: 'GONE', discountAmd: 300, totalAmd: 1700 });
  });

  it('places an order without a code just as before', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2000 });
    const placed = await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    expect(placed.json().order).toMatchObject({ discountAmd: 0, promoCode: null, totalAmd: 2000 });
  });
});

describe('promo codes in the statistics', () => {
  it('shows each code with its orders, its discount and what those orders came to, without cancelled ones', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2500, stockQty: 50 });
    await createPromo({ code: 'PELMENI20', value: 20 });
    const gone = await createPromo({ code: 'MINUS300', kind: 'amount', value: 300 });

    await postOrder(ctx.app, orderBody([{ productId: id, qty: 2 }], { promoCode: 'PELMENI20' })); // 5000 − 1000
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 4 }], { promoCode: 'PELMENI20' })); // 10000 − 2000
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }], { promoCode: 'MINUS300' })); // 2500 − 300
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }], { promoCode: 'PELMENI20' })); // cancelled below
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }])); // no code
    const [cancelled] = (await asAdmin({ url: '/api/admin/orders' })).json().orders.slice(1, 2);
    await asAdmin({ method: 'PATCH', url: `/api/admin/orders/${cancelled.id}`, payload: { status: 'cancelled' } });
    // A deleted code keeps its line: the orders still carry its text.
    await asAdmin({ method: 'DELETE', url: `/api/admin/promo-codes/${gone.id}` });

    const today = shopToday();
    const stats = (await asAdmin({ url: `/api/admin/orders/stats?from=${today}&to=${today}` })).json();
    expect(stats.promoCodes).toEqual([
      { code: 'PELMENI20', count: 2, discountAmd: 3000, totalAmd: 12000 },
      { code: 'MINUS300', count: 1, discountAmd: 300, totalAmd: 2200 },
    ]);
    // The period's sum is what was paid: after the discounts.
    expect(stats.kept.totalAmd).toBe(12000 + 2200 + 2500);
  });
});
