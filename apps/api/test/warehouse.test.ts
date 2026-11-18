import { shopToday, type CompositionLine, type WarehouseView } from '@alyosha/shared';
import { sql } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addProduct, adminCookie, createTestContext, orderBody, postOrder, type TestContext } from './helpers';

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

async function addIngredient(name: string, unit: 'g' | 'ml' | 'pcs'): Promise<number> {
  const response = await asAdmin({ method: 'POST', url: '/api/admin/ingredients', payload: { name, unit } });
  expect(response.statusCode).toBe(201);
  return (response.json() as WarehouseView).ingredients.find((ingredient) => ingredient.name === name)!.id;
}

async function buy(ingredientId: number, qty: number, paidAmd: number, purchasedOn?: string): Promise<WarehouseView> {
  const response = await asAdmin({
    method: 'POST',
    url: `/api/admin/ingredients/${ingredientId}/purchases`,
    payload: { qty, paidAmd, ...(purchasedOn && { purchasedOn }) },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function compose(productId: number, lines: CompositionLine[]) {
  const response = await asAdmin({ method: 'PUT', url: `/api/admin/products/${productId}/composition`, payload: { lines } });
  expect(response.statusCode).toBe(200);
}

async function warehouse(): Promise<WarehouseView> {
  return (await asAdmin({ url: '/api/admin/warehouse' })).json();
}

async function ingredient(id: number) {
  return (await warehouse()).ingredients.find((item) => item.id === id)!;
}

async function order(items: { productId: number; qty: number }[], overrides = {}): Promise<number> {
  const response = await postOrder(ctx.app, orderBody(items, overrides));
  expect(response.statusCode).toBe(201);
  const result = await ctx.db.execute<{ id: number }>(sql`SELECT max(id)::int AS id FROM orders`);
  return result.rows[0]!.id;
}

const setStatus = (id: number, status: string) => asAdmin({ method: 'PATCH', url: `/api/admin/orders/${id}`, payload: { status } });

const todayStats = async () => {
  const today = shopToday();
  return (await asAdmin({ url: `/api/admin/orders/stats?from=${today}&to=${today}` })).json();
};

/**
 * The example the owner was shown: a 5 000 ֏ pack of пельмени made of 200 g of beef, 500 g of
 * flour, 100 g of onion and one bag, which costs 1 260 ֏ to make.
 */
async function pelmeniShop() {
  const beef = await addIngredient('Говядина', 'g');
  const flour = await addIngredient('Мука', 'g');
  const onion = await addIngredient('Лук', 'g');
  const bag = await addIngredient('Пакет', 'pcs');
  await buy(beef, 5000, 25_000); // 5 ֏ a gram
  await buy(flour, 10_000, 4000); // 0.4 ֏ a gram
  await buy(onion, 3000, 900); // 0.3 ֏ a gram
  await buy(bag, 100, 3000); // 30 ֏ each
  const pelmeni = await addProduct(ctx.db, { name: 'Пельмени говяжьи', priceAmd: 5000, stockQty: 20 });
  await compose(pelmeni, [
    { ingredientId: beef, qty: 200 },
    { ingredientId: flour, qty: 500 },
    { ingredientId: onion, qty: 100 },
    { ingredientId: bag, qty: 1 },
  ]);
  return { beef, flour, onion, bag, pelmeni };
}

describe('the warehouse', () => {
  it('keeps the average price of what is on the shelf as purchases come in and go', async () => {
    const beef = await addIngredient('Говядина', 'g');
    let view = await buy(beef, 5000, 25_000);
    expect(view.ingredients[0]).toMatchObject({ name: 'Говядина', unit: 'g', stockQty: 5000, unitCostAmd: 5 });

    // 5 kg more at 6 000 ֏ a kilogram: 10 kg at 5 500 ֏ a kilogram on average.
    view = await buy(beef, 5000, 30_000, '2026-11-01');
    expect(view.ingredients[0]).toMatchObject({ stockQty: 10_000, unitCostAmd: 5.5 });
    expect(view.purchases.map((purchase) => purchase.purchasedOn)).toEqual([shopToday(), '2026-11-01']);

    // The second purchase was a mistake: taking it back restores the first price.
    const mistake = view.purchases.find((purchase) => purchase.purchasedOn === '2026-11-01')!;
    const response = await asAdmin({ method: 'DELETE', url: `/api/admin/purchases/${mistake.id}` });
    expect(response.statusCode).toBe(200);
    expect((response.json() as WarehouseView).ingredients[0]).toMatchObject({ stockQty: 5000, unitCostAmd: 5 });
  });

  it('prices a purchase on an empty or overdrawn shelf at its own price', async () => {
    const flour = await addIngredient('Мука', 'g');
    await asAdmin({ method: 'PATCH', url: `/api/admin/ingredients/${flour}`, payload: { stockQty: -2000, unitCostAmd: 1 } });
    const view = await buy(flour, 10_000, 4000);
    expect(view.ingredients[0]).toMatchObject({ stockQty: 8000, unitCostAmd: 0.4 });
  });

  it('refuses a second ingredient of the same name and keeps one that is in a composition', async () => {
    const beef = await addIngredient('Говядина', 'g');
    const twin = await asAdmin({ method: 'POST', url: '/api/admin/ingredients', payload: { name: 'говядина', unit: 'g' } });
    expect(twin.statusCode).toBe(409);
    expect(twin.json()).toMatchObject({ error: 'name_taken' });

    const pelmeni = await addProduct(ctx.db);
    await compose(pelmeni, [{ ingredientId: beef, qty: 200 }]);
    const used = await asAdmin({ method: 'DELETE', url: `/api/admin/ingredients/${beef}` });
    expect(used.statusCode).toBe(409);
    expect(used.json()).toMatchObject({ error: 'in_use' });

    await compose(pelmeni, []);
    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/ingredients/${beef}` })).statusCode).toBe(200);
  });

  it('refuses a composition with an unknown ingredient or one ingredient twice', async () => {
    const beef = await addIngredient('Говядина', 'g');
    const pelmeni = await addProduct(ctx.db);
    const put = (lines: unknown) => asAdmin({ method: 'PUT', url: `/api/admin/products/${pelmeni}/composition`, payload: { lines } });
    expect((await put([{ ingredientId: 999, qty: 1 }])).statusCode).toBe(400);
    expect((await put([{ ingredientId: beef, qty: 1 }, { ingredientId: beef, qty: 2 }])).statusCode).toBe(400);
    expect((await put([{ ingredientId: beef, qty: 0 }])).statusCode).toBe(400);
    expect((await asAdmin({ url: `/api/admin/products/${pelmeni}/composition` })).json()).toEqual({ lines: [] });
  });

  it('needs the admin session', async () => {
    expect((await ctx.app.inject({ url: '/api/admin/warehouse' })).statusCode).toBe(401);
  });
});

describe('cost and profit of orders', () => {
  it('takes the composition off the shelf and counts the profit of a sale', async () => {
    const { beef, flour, bag, pelmeni } = await pelmeniShop();
    const id = await order([{ productId: pelmeni, qty: 2 }]);

    const [line] = (await ctx.db.execute<{ unit_cost_amd: number }>(sql`SELECT unit_cost_amd FROM order_items WHERE order_id = ${id}`)).rows;
    expect(line!.unit_cost_amd).toBe(1260);
    expect(await ingredient(beef)).toMatchObject({ stockQty: 4600 });
    expect(await ingredient(flour)).toMatchObject({ stockQty: 9000 });
    expect(await ingredient(bag)).toMatchObject({ stockQty: 98 });

    const stats = await todayStats();
    expect(stats.profit).toEqual({ goodsAmd: 10_000, costAmd: 2520, profitAmd: 7480, uncostedQty: 0 });
    expect(stats.products).toEqual([
      { productId: pelmeni, name: 'Пельмени говяжьи', qty: 2, totalAmd: 10_000, costedQty: 2, profitAmd: 7480 },
    ]);
    expect(stats.days).toEqual([{ date: shopToday(), count: 1, cancelledCount: 0, totalAmd: 10_000, profitAmd: 7480 }]);
    expect(stats.purchasesAmd).toBe(25_000 + 4000 + 900 + 3000);
  });

  it('keeps an order’s cost when prices and the composition change later', async () => {
    const { beef, pelmeni } = await pelmeniShop();
    const id = await order([{ productId: pelmeni, qty: 1 }]);

    // Beef gets dearer and the pack gets more of it: the order placed before stays as it was.
    await buy(beef, 4800, 48_000);
    await compose(pelmeni, [{ ingredientId: beef, qty: 300 }]);
    expect((await todayStats()).profit).toMatchObject({ costAmd: 1260, profitAmd: 3740 });

    // Cancelled, it puts back exactly what it took: 200 g, not the new 300 g.
    const before = (await ingredient(beef)).stockQty;
    expect((await setStatus(id, 'cancelled')).statusCode).toBe(200);
    expect((await ingredient(beef)).stockQty).toBe(before + 200);
    expect((await todayStats()).profit).toEqual({ goodsAmd: 0, costAmd: 0, profitAmd: 0, uncostedQty: 0 });

    // Reopened, it takes it again.
    expect((await setStatus(id, 'confirmed')).statusCode).toBe(200);
    expect((await ingredient(beef)).stockQty).toBe(before);
  });

  it('moves the ingredients by the difference when the owner changes the goods, and back when he deletes the order', async () => {
    const { beef, pelmeni } = await pelmeniShop();
    const plain = await addProduct(ctx.db, { name: 'Вареники', priceAmd: 2000, stockQty: 20 });
    const id = await order([{ productId: pelmeni, qty: 2 }]);
    expect((await ingredient(beef)).stockQty).toBe(4600);

    const edited = await asAdmin({
      method: 'PUT',
      url: `/api/admin/orders/${id}`,
      payload: {
        customerName: 'Тест',
        customerPhone: '+374 91 123456',
        customerTelegram: null,
        comment: null,
        deliveryMethod: 'pickup',
        deliveryAddress: null,
        items: [
          { productId: pelmeni, qty: 3 },
          { productId: plain, qty: 1 },
        ],
      },
    });
    expect(edited.statusCode).toBe(200);
    expect((await ingredient(beef)).stockQty).toBe(4400);
    // The product without a composition sells at its full price, flagged as not costed.
    expect((await todayStats()).profit).toEqual({ goodsAmd: 17_000, costAmd: 3780, profitAmd: 13_220, uncostedQty: 1 });

    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/orders/${id}` })).statusCode).toBe(200);
    expect((await ingredient(beef)).stockQty).toBe(5000);
  });

  it('counts the profit after a promo code’s discount', async () => {
    const { pelmeni } = await pelmeniShop();
    const promo = await asAdmin({
      method: 'POST',
      url: '/api/admin/promo-codes',
      payload: { code: 'MINUS10', kind: 'percent', value: 10, categories: [], productIds: [], maxUses: null, validUntil: null, isActive: true },
    });
    expect(promo.statusCode).toBe(201);
    await order([{ productId: pelmeni, qty: 2 }], { promoCode: 'MINUS10' });
    expect((await todayStats()).profit).toEqual({ goodsAmd: 9000, costAmd: 2520, profitAmd: 6480, uncostedQty: 0 });
  });

  it('lets the owner write down what a «Свой рецепт» request cost', async () => {
    const placed = await ctx.app.inject({
      method: 'POST',
      url: '/api/custom-orders',
      payload: {
        recipeName: 'Мой рецепт',
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
    expect(placed.statusCode).toBe(201);
    const [{ id }] = (await ctx.db.execute<{ id: number }>(sql`SELECT max(id)::int AS id FROM custom_orders`)).rows as [{ id: number }];

    await asAdmin({ method: 'PUT', url: `/api/admin/custom-orders/${id}/price`, payload: { priceAmd: 12_000 } });
    const costed = await asAdmin({ method: 'PUT', url: `/api/admin/custom-orders/${id}/cost`, payload: { costAmd: 5000 } });
    expect(costed.statusCode).toBe(200);
    expect(costed.json()).toMatchObject({ priceAmd: 12_000, costAmd: 5000 });
    expect((await todayStats()).recipes).toEqual({ count: 1, pricedCount: 1, totalAmd: 12_000, costedCount: 1, profitAmd: 7000 });

    const bad = await asAdmin({ method: 'PUT', url: `/api/admin/custom-orders/${id}/cost`, payload: { costAmd: -1 } });
    expect(bad.statusCode).toBe(400);
  });
});
