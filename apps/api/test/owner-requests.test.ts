// What Алексей asked for in October 2026: pre-orders, editing orders, prices for «Свой рецепт»,
// his own labels on products, and his own wording of the bot's messages.

import { DEFAULT_BOT_TEXTS, formatAmd, shopToday, type Settings } from '@alyosha/shared';
import { sql } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatOrderMessage } from '../src/notify';
import { getOrder } from '../src/services/admin-orders';
import { botText, customStatusText } from '../src/services/buyer-bot';
import {
  addProduct,
  adminCookie,
  createTestContext,
  orderBody,
  postOrder,
  stockOf,
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

function asAdmin(options: InjectOptions) {
  return ctx.app.inject({ ...options, headers: { ...options.headers, cookie: adminCookie() } });
}

async function setSettings(change: Partial<Settings>) {
  const current = (await asAdmin({ url: '/api/admin/settings' })).json();
  const saved = await asAdmin({ method: 'PUT', url: '/api/admin/settings', payload: { ...current, ...change } });
  expect(saved.statusCode).toBe(200);
}

const preordersOn = () => setSettings({ preorderEnabled: true, preorderNote: 'Будет готово через 2–3 дня' });

async function lastOrderId(): Promise<number> {
  const result = await ctx.db.execute<{ id: number }>(sql`SELECT max(id)::int AS id FROM orders`);
  return result.rows[0]!.id;
}

const order = async (id: number) => (await asAdmin({ url: `/api/admin/orders/${id}` })).json();

// ---------- 1. Pre-orders ----------

describe('pre-orders', () => {
  it('takes an order for a product that has run out, and keeps the stock at zero', async () => {
    await preordersOn();
    const id = await addProduct(ctx.db, { name: 'Пельмени', stockQty: 0 });

    const placed = await postOrder(ctx.app, orderBody([{ productId: id, qty: 3 }]));
    expect(placed.statusCode).toBe(201);
    expect(placed.json().order).toMatchObject({ isPreorder: true, items: [{ qty: 3, preorderQty: 3 }] });
    expect(await stockOf(ctx.db, id)).toBe(0);
  });

  it('takes what is in stock and makes the rest to order', async () => {
    await preordersOn();
    const id = await addProduct(ctx.db, { name: 'Пельмени', stockQty: 2 });

    const placed = await postOrder(ctx.app, orderBody([{ productId: id, qty: 5 }]));
    expect(placed.json().order).toMatchObject({ isPreorder: true, items: [{ qty: 5, preorderQty: 3 }] });
    expect(await stockOf(ctx.db, id)).toBe(0);

    const owner = formatOrderMessage((await getOrder(ctx.db, await lastOrderId()))!);
    expect(owner).toContain('предзаказ');
    expect(owner).toContain('под заказ: 3');
  });

  it('puts back only what came out of the stock, on cancelling and on deleting', async () => {
    await preordersOn();
    const id = await addProduct(ctx.db, { stockQty: 2 });
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 5 }]));
    const first = await lastOrderId();
    await asAdmin({ method: 'PATCH', url: `/api/admin/orders/${first}`, payload: { status: 'cancelled' } });
    expect(await stockOf(ctx.db, id)).toBe(2);

    // Reopened with only one left: that one is taken, the other becomes made to order.
    await ctx.db.execute(sql`UPDATE products SET stock_qty = 1 WHERE id = ${id}`);
    const reopened = await asAdmin({ method: 'PATCH', url: `/api/admin/orders/${first}`, payload: { status: 'new' } });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json().order).toMatchObject({ isPreorder: true, items: [{ qty: 5, preorderQty: 4 }] });
    expect(await stockOf(ctx.db, id)).toBe(0);

    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/orders/${first}` })).statusCode).toBe(200);
    expect(await stockOf(ctx.db, id)).toBe(1);
  });

  it('never sells a product that is hidden from the shop', async () => {
    await preordersOn();
    const id = await addProduct(ctx.db, { stockQty: 0, isActive: false });
    expect((await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]))).statusCode).toBe(409);
  });

  it('refuses more than the stock when pre-orders are off, as before', async () => {
    const id = await addProduct(ctx.db, { stockQty: 1 });
    expect((await postOrder(ctx.app, orderBody([{ productId: id, qty: 2 }]))).json().error).toBe('insufficient_stock');
  });
});

// ---------- 2. Editing an order ----------

describe('editing an order', () => {
  const edit = (id: number, payload: Record<string, unknown>) =>
    asAdmin({ method: 'PUT', url: `/api/admin/orders/${id}`, payload });
  const details = {
    customerName: 'Анна',
    customerPhone: '+374 91 222333',
    customerTelegram: '@anna_ok',
    comment: 'Позвонить заранее',
    deliveryMethod: 'courier',
    deliveryAddress: 'ул. Абовяна, 5',
  };

  it('changes who it is for and how it is delivered', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2000 });
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    const orderId = await lastOrderId();

    const saved = await edit(orderId, { ...details, items: [{ productId: id, qty: 1 }] });
    expect(saved.statusCode).toBe(200);
    // The tests' shop: courier 1000 below 10 000.
    expect(saved.json().order).toMatchObject({
      customerName: 'Анна',
      customerPhone: '+37491222333',
      customerTelegram: 'anna_ok',
      comment: 'Позвонить заранее',
      deliveryMethod: 'courier',
      deliveryAddress: 'ул. Абовяна, 5',
      deliveryFeeAmd: 1000,
      totalAmd: 3000,
    });
  });

  it('changes the goods, moving the stock by the difference and keeping the price they were bought at', async () => {
    const a = await addProduct(ctx.db, { name: 'А', priceAmd: 2000, stockQty: 10 });
    const b = await addProduct(ctx.db, { name: 'Б', priceAmd: 3000, stockQty: 10 });
    const c = await addProduct(ctx.db, { name: 'В', priceAmd: 1500, stockQty: 10 });
    await postOrder(ctx.app, orderBody([{ productId: a, qty: 2 }, { productId: b, qty: 1 }]));
    const orderId = await lastOrderId();
    await ctx.db.execute(sql`UPDATE products SET price_amd = 2500 WHERE id = ${a}`);

    // А: 2 → 5; Б out; В in.
    const saved = await edit(orderId, { ...details, deliveryMethod: 'pickup', deliveryAddress: null, items: [{ productId: a, qty: 5 }, { productId: c, qty: 2 }] });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().order.items).toEqual([
      { productId: a, name: 'А', priceAmd: 2000, qty: 5, preorderQty: 0 },
      { productId: c, name: 'В', priceAmd: 1500, qty: 2, preorderQty: 0 },
    ]);
    expect(saved.json().order).toMatchObject({ itemsTotalAmd: 13000, totalAmd: 13000 });
    expect([await stockOf(ctx.db, a), await stockOf(ctx.db, b), await stockOf(ctx.db, c)]).toEqual([5, 10, 8]);
  });

  it('refuses more than the stock with pre-orders off, and changes nothing', async () => {
    const id = await addProduct(ctx.db, { stockQty: 3 });
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    const orderId = await lastOrderId();

    // The order's own one counts: 1 held + 2 left = 3 at most.
    const tooMany = await edit(orderId, { ...details, items: [{ productId: id, qty: 4 }] });
    expect(tooMany.statusCode).toBe(409);
    expect(tooMany.json()).toMatchObject({ ok: false, error: 'insufficient_stock', shortages: [{ productId: id, available: 3 }] });
    expect(await stockOf(ctx.db, id)).toBe(2);
    expect((await order(orderId)).customerName).toBe('Тест');

    expect((await edit(orderId, { ...details, items: [{ productId: id, qty: 3 }] })).statusCode).toBe(200);
    expect(await stockOf(ctx.db, id)).toBe(0);
  });

  it('makes the rest to order when pre-orders are on', async () => {
    await preordersOn();
    const id = await addProduct(ctx.db, { stockQty: 1 });
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    const saved = await edit(await lastOrderId(), { ...details, items: [{ productId: id, qty: 4 }] });
    expect(saved.json().order).toMatchObject({ isPreorder: true, items: [{ qty: 4, preorderQty: 3 }] });
    expect(await stockOf(ctx.db, id)).toBe(0);
  });

  it('keeps the goods of a completed order, but lets its details change', async () => {
    const id = await addProduct(ctx.db, { stockQty: 5 });
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    const orderId = await lastOrderId();
    await asAdmin({ method: 'PATCH', url: `/api/admin/orders/${orderId}`, payload: { status: 'done' } });

    expect((await edit(orderId, { ...details, items: [{ productId: id, qty: 2 }] })).json()).toEqual({ ok: false, error: 'items_locked' });
    expect((await edit(orderId, { ...details, items: [{ productId: id, qty: 1 }] })).statusCode).toBe(200);
    expect(await stockOf(ctx.db, id)).toBe(4);
  });

  it('works the promo code’s discount out again for the new goods', async () => {
    const id = await addProduct(ctx.db, { priceAmd: 2000 });
    await asAdmin({
      method: 'POST',
      url: '/api/admin/promo-codes',
      payload: { code: 'MINUS20', kind: 'percent', value: 20, categories: [], productIds: [], maxUses: null, validUntil: null, isActive: true },
    });
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }], { promoCode: 'MINUS20' }));
    const saved = await edit(await lastOrderId(), { ...details, deliveryMethod: 'pickup', deliveryAddress: null, items: [{ productId: id, qty: 3 }] });
    expect(saved.json().order).toMatchObject({ itemsTotalAmd: 6000, discountAmd: 1200, promoCode: 'MINUS20', totalAmd: 4800 });
  });

  it('refuses a product listed twice, a courier without an address, and anyone without a session', async () => {
    const id = await addProduct(ctx.db);
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    const orderId = await lastOrderId();
    expect((await edit(orderId, { ...details, items: [{ productId: id, qty: 1 }, { productId: id, qty: 2 }] })).statusCode).toBe(400);
    expect((await edit(orderId, { ...details, deliveryAddress: null, items: [{ productId: id, qty: 1 }] })).statusCode).toBe(400);
    expect((await edit(999, { ...details, items: [{ productId: id, qty: 1 }] })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'PUT', url: `/api/admin/orders/${orderId}`, payload: details })).statusCode).toBe(401);
  });
});

// ---------- 3. Prices for «Свой рецепт» ----------

describe('a price for «Свой рецепт»', () => {
  async function placeRecipe(name: string): Promise<number> {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/custom-orders',
      payload: {
        recipeName: name,
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
    expect(response.statusCode).toBe(201);
    const result = await ctx.db.execute<{ id: number }>(sql`SELECT max(id)::int AS id FROM custom_orders`);
    return result.rows[0]!.id;
  }
  const price = (id: number, priceAmd: unknown) => asAdmin({ method: 'PUT', url: `/api/admin/custom-orders/${id}/price`, payload: { priceAmd } });

  it('is named by the owner, can be taken away again, and must be a whole positive sum', async () => {
    const id = await placeRecipe('Острые');
    expect((await price(id, 15000)).json()).toMatchObject({ id, priceAmd: 15000 });
    expect((await price(id, null)).json().priceAmd).toBeNull();
    expect((await price(id, -1)).statusCode).toBe(400);
    expect((await price(id, 'дорого')).statusCode).toBe(400);
    expect((await price(999, 100)).statusCode).toBe(404);
  });

  it('counts in the statistics when it has a price and is not cancelled', async () => {
    const priced = await placeRecipe('Первые');
    await placeRecipe('Без цены');
    const cancelled = await placeRecipe('Отменённые');
    await price(priced, 15000);
    await price(cancelled, 5000);
    await asAdmin({ method: 'PATCH', url: `/api/admin/custom-orders/${cancelled}`, payload: { status: 'cancelled' } });

    const today = shopToday();
    const stats = (await asAdmin({ url: `/api/admin/orders/stats?from=${today}&to=${today}` })).json();
    expect(stats.recipes).toEqual({ count: 2, pricedCount: 1, totalAmd: 15000 });
  });

  it('is told to the buyer with the confirmation', () => {
    const text = customStatusText({ status: 'confirmed', recipeName: 'Острые', priceAmd: 12000 }, DEFAULT_SETTINGS);
    expect(text).toContain('Рецепт «Острые» подтверждён');
    expect(text).toContain(`Цена: <b>${formatAmd(12000)}</b>`);
    expect(customStatusText({ status: 'confirmed', recipeName: 'Острые', priceAmd: null }, DEFAULT_SETTINGS)).not.toContain('Цена');
  });
});

const DEFAULT_SETTINGS = { preorderNote: 'Будет готово через 2–3 дня', ...DEFAULT_BOT_TEXTS };

// ---------- 4. The owner's own labels on products ----------

describe('labels on products', () => {
  const create = (badges: unknown) =>
    asAdmin({ method: 'POST', url: '/api/admin/products', payload: { name: 'Пельмени', category: 'pelmeni', priceAmd: 2000, badges } });

  it('are kept without repeats or empty ones and shown in the shop', async () => {
    const created = await create(['Бест-селлер', ' ', 'Бест-селлер', 'Острое ']);
    expect(created.statusCode).toBe(201);
    expect(created.json().product.badges).toEqual(['Бест-селлер', 'Острое']);

    const shown = (await ctx.app.inject({ url: '/api/products' })).json();
    expect(shown[0].badges).toEqual(['Бест-селлер', 'Острое']);

    const changed = await asAdmin({ method: 'PATCH', url: `/api/admin/products/${created.json().product.id}`, payload: { badges: [] } });
    expect(changed.json().product.badges).toEqual([]);
  });

  it('are at most three, of at most 24 characters', async () => {
    expect((await create(['1', '2', '3', '4'])).statusCode).toBe(400);
    expect((await create(['Очень-очень длинная надпись'])).statusCode).toBe(400);
  });
});

// ---------- 6. The bot's messages in the owner's words ----------

describe('the bot’s messages in the owner’s words', () => {
  async function followedOrder(): Promise<number> {
    const id = await addProduct(ctx.db, { priceAmd: 2000 });
    const placed = await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    const start = new URL(placed.json().order.telegramLink).searchParams.get('start')!;
    await ctx.app.inject({
      method: 'POST',
      url: '/api/telegram/webhook',
      headers: { 'x-telegram-bot-api-secret-token': TEST_WEBHOOK_SECRET },
      payload: { update_id: 1, message: { message_id: 1, text: `/start ${start}`, chat: { id: 777, type: 'private' } } },
    });
    return lastOrderId();
  }

  it('sends his text, safely, with the number filled in and the first line in bold', async () => {
    await setSettings({ botOrderConfirmed: 'Ура!\nЗаказ {номер} принят <в работу>' });
    const orderId = await followedOrder();
    await asAdmin({ method: 'PATCH', url: `/api/admin/orders/${orderId}`, payload: { status: 'confirmed' } });
    expect(ctx.sent.buyer.at(-1)!.text).toBe('<b>Ура!</b>\nЗаказ A-0001 принят &lt;в работу&gt;');
  });

  it('goes back to the shop’s own words when a text is emptied', async () => {
    await setSettings({ botOrderDone: '   ' });
    expect((await asAdmin({ url: '/api/admin/settings' })).json().botOrderDone).toBe(DEFAULT_BOT_TEXTS.botOrderDone);
    const orderId = await followedOrder();
    await asAdmin({ method: 'PATCH', url: `/api/admin/orders/${orderId}`, payload: { status: 'done' } });
    expect(ctx.sent.buyer.at(-1)!.text).toContain('Заказ выполнен');
  });

  it('fills in the recipe’s name and leaves a one-line text as it is', () => {
    expect(botText('Рецепт «{рецепт}» готов', { рецепт: 'Мои & твои' })).toBe('Рецепт «Мои &amp; твои» готов');
  });
});
