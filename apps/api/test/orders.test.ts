import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { formatOrderMessage } from '../src/notify';
import { addProduct, countRows, createTestContext, orderBody, postOrder, stockOf, type TestContext } from './helpers';

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

describe('stock is never oversold (SPEC §12)', () => {
  it('lets only one of two simultaneous orders for the last item succeed', async () => {
    const id = await addProduct(ctx.db, { stockQty: 1 });

    const responses = await Promise.all([
      postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }])),
      postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }])),
    ]);

    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);

    const rejected = responses.find((r) => r.statusCode === 409)!.json();
    expect(rejected).toMatchObject({
      ok: false,
      error: 'insufficient_stock',
      shortages: [{ productId: id, available: 0 }],
    });

    expect(await stockOf(ctx.db, id)).toBe(0);
    expect(await countRows(ctx.db, 'orders')).toBe(1);
    expect(await countRows(ctx.db, 'order_items')).toBe(1);
  });

  it('sells exactly the stock when many buyers order at once', async () => {
    const id = await addProduct(ctx.db, { stockQty: 5 });

    const responses = await Promise.all(
      Array.from({ length: 25 }, () => postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]))),
    );

    expect(responses.filter((r) => r.statusCode === 201)).toHaveLength(5);
    expect(responses.filter((r) => r.statusCode === 409)).toHaveLength(20);
    expect(await stockOf(ctx.db, id)).toBe(0);
    expect(await countRows(ctx.db, 'orders')).toBe(5);
  });

  it('does not deadlock when orders list the same products in opposite order', async () => {
    const a = await addProduct(ctx.db, { stockQty: 100 });
    const b = await addProduct(ctx.db, { stockQty: 100 });

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        postOrder(
          ctx.app,
          orderBody(
            i % 2 === 0
              ? [
                  { productId: a, qty: 1 },
                  { productId: b, qty: 2 },
                ]
              : [
                  { productId: b, qty: 2 },
                  { productId: a, qty: 1 },
                ],
          ),
        ),
      ),
    );

    expect(responses.every((r) => r.statusCode === 201)).toBe(true);
    expect(await stockOf(ctx.db, a)).toBe(80);
    expect(await stockOf(ctx.db, b)).toBe(60);
  });

  it('changes nothing when any one item is short', async () => {
    const plenty = await addProduct(ctx.db, { stockQty: 10 });
    const scarce = await addProduct(ctx.db, { stockQty: 2, name: 'Манты' });

    const response = await postOrder(
      ctx.app,
      orderBody([
        { productId: plenty, qty: 3 },
        { productId: scarce, qty: 5 },
      ]),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json().shortages).toEqual([{ productId: scarce, name: 'Манты', available: 2 }]);
    expect(await stockOf(ctx.db, plenty)).toBe(10);
    expect(await stockOf(ctx.db, scarce)).toBe(2);
    expect(await countRows(ctx.db, 'orders')).toBe(0);
  });

  it('counts the same product listed twice as one line', async () => {
    const id = await addProduct(ctx.db, { stockQty: 3 });

    const response = await postOrder(
      ctx.app,
      orderBody([
        { productId: id, qty: 2 },
        { productId: id, qty: 2 },
      ]),
    );

    expect(response.statusCode).toBe(409);
    expect(await stockOf(ctx.db, id)).toBe(3);
  });

  it('refuses inactive and unknown products', async () => {
    const hidden = await addProduct(ctx.db, { stockQty: 10, isActive: false });

    expect((await postOrder(ctx.app, orderBody([{ productId: hidden, qty: 1 }]))).statusCode).toBe(409);
    expect((await postOrder(ctx.app, orderBody([{ productId: 99999, qty: 1 }]))).statusCode).toBe(409);
    expect(await stockOf(ctx.db, hidden)).toBe(10);
    expect(await countRows(ctx.db, 'orders')).toBe(0);
  });

  it('is also guarded by the database itself', async () => {
    const id = await addProduct(ctx.db, { stockQty: 1 });
    await expect(ctx.db.execute(sql`UPDATE products SET stock_qty = stock_qty - 2 WHERE id = ${id}`)).rejects.toThrow();
    expect(await stockOf(ctx.db, id)).toBe(1);
  });
});

describe('order contents', () => {
  it('decrements stock, snapshots name and price, and numbers the order', async () => {
    const id = await addProduct(ctx.db, { stockQty: 10, priceAmd: 2400, name: 'Пельмени домашние' });

    const response = await postOrder(ctx.app, orderBody([{ productId: id, qty: 3 }]));
    expect(response.statusCode).toBe(201);
    expect(response.json().order).toEqual({
      publicNumber: 'A-0001',
      items: [{ productId: id, name: 'Пельмени домашние', priceAmd: 2400, qty: 3 }],
      itemsTotalAmd: 7200,
      deliveryFeeAmd: 0,
      deliveryExtra: false,
      totalAmd: 7200,
      deliveryMethod: 'pickup',
      deliveryAddress: null,
      telegramLink: expect.stringMatching(/^https:\/\/t\.me\/test_shop_bot\?start=o[\w-]{22}$/),
    });
    expect(await stockOf(ctx.db, id)).toBe(7);

    // A later price or name change must not rewrite the order.
    await ctx.db.execute(sql`UPDATE products SET price_amd = 9999, name = 'Другое' WHERE id = ${id}`);
    const stored = await ctx.db.execute(sql`SELECT product_name_snapshot, price_amd_snapshot, qty FROM order_items`);
    expect(stored.rows).toEqual([{ product_name_snapshot: 'Пельмени домашние', price_amd_snapshot: 2400, qty: 3 }]);

    const second = await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    expect(second.json().order.publicNumber).toBe('A-0002');
  });

  it('charges the courier fee below the free-delivery threshold and nothing above it', async () => {
    const id = await addProduct(ctx.db, { stockQty: 50, priceAmd: 2000 });
    const courier = { deliveryMethod: 'courier' as const, deliveryAddress: 'ул. Тестовая, 1' };

    const small = await postOrder(ctx.app, orderBody([{ productId: id, qty: 4 }], courier));
    expect(small.json().order).toMatchObject({ itemsTotalAmd: 8000, deliveryFeeAmd: 1000, totalAmd: 9000 });

    const large = await postOrder(ctx.app, orderBody([{ productId: id, qty: 5 }], courier));
    expect(large.json().order).toMatchObject({ itemsTotalAmd: 10000, deliveryFeeAmd: 0, totalAmd: 10000 });
  });

  it('leaves delivery out of the total, marked as paid separately, when the shop has no fixed courier fee', async () => {
    await ctx.db.execute(sql`UPDATE settings SET value = '0' WHERE key = 'courier_fee_amd'`);
    const id = await addProduct(ctx.db, { stockQty: 50, priceAmd: 2000 });
    const courier = { deliveryMethod: 'courier' as const, deliveryAddress: 'ул. Тестовая, 1' };

    const small = await postOrder(ctx.app, orderBody([{ productId: id, qty: 4 }], courier));
    expect(small.json().order).toMatchObject({ deliveryFeeAmd: 0, deliveryExtra: true, totalAmd: 8000 });
    // The owner's message says so too, so he does not read the total as the whole sum.
    const message = formatOrderMessage(small.json().order, { name: 'Тест', phone: '+37491000000', telegram: null, comment: null });
    expect(message).toContain('Курьер: доставка оплачивается отдельно');
    expect(message).toMatch(/Итого: 8\s000\s֏ \+ доставка/);

    // Above the threshold delivery is simply free, and so is pickup at any sum.
    const large = await postOrder(ctx.app, orderBody([{ productId: id, qty: 5 }], courier));
    expect(large.json().order).toMatchObject({ deliveryFeeAmd: 0, deliveryExtra: false, totalAmd: 10000 });
    const pickup = await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    expect(pickup.json().order).toMatchObject({ deliveryFeeAmd: 0, deliveryExtra: false, totalAmd: 2000 });

    const stored = await ctx.db.execute(sql`SELECT delivery_extra FROM orders ORDER BY id`);
    expect(stored.rows.map((row) => row.delivery_extra)).toEqual([true, false, false]);
  });

  it('stores the customer with a normalised phone and Telegram name', async () => {
    const id = await addProduct(ctx.db);

    await postOrder(
      ctx.app,
      orderBody([{ productId: id, qty: 1 }], {
        customerName: '  Анна ',
        customerPhone: '091 12-34-56',
        customerTelegram: '@anna_test',
        comment: ' позвоните вечером ',
      }),
    );

    const stored = await ctx.db.execute(
      sql`SELECT customer_name, customer_phone, customer_telegram, comment, status FROM orders`,
    );
    expect(stored.rows).toEqual([
      {
        customer_name: 'Анна',
        customer_phone: '+37491123456',
        customer_telegram: 'anna_test',
        comment: 'позвоните вечером',
        status: 'new',
      },
    ]);
  });

  it('tells the owner about every accepted order and only those', async () => {
    const id = await addProduct(ctx.db, { stockQty: 1 });

    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));
    await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }]));

    expect(ctx.sent.orders).toEqual(['A-0001']);
  });
});

describe('validation', () => {
  it.each([
    ['a bad phone', { customerPhone: '12345' }],
    ['a missing name', { customerName: ' ' }],
    ['courier without an address', { deliveryMethod: 'courier' as const, deliveryAddress: ' ' }],
    ['a bad Telegram name', { customerTelegram: 'a b' }],
    ['a filled honeypot', { website: 'http://spam.example' }],
  ])('rejects %s', async (_label, overrides) => {
    const id = await addProduct(ctx.db);

    const response = await postOrder(ctx.app, orderBody([{ productId: id, qty: 1 }], overrides));

    expect(response.statusCode).toBe(400);
    expect(await stockOf(ctx.db, id)).toBe(10);
    expect(await countRows(ctx.db, 'orders')).toBe(0);
  });

  it.each([
    ['an empty cart', []],
    ['a zero quantity', [{ productId: 1, qty: 0 }]],
    ['a fractional quantity', [{ productId: 1, qty: 1.5 }]],
    ['a negative quantity', [{ productId: 1, qty: -3 }]],
  ])('rejects %s', async (_label, items) => {
    expect((await postOrder(ctx.app, orderBody(items))).statusCode).toBe(400);
  });

  it('rejects a body that is not an order', async () => {
    expect((await postOrder(ctx.app, { hello: 'world' })).statusCode).toBe(400);
  });
});

describe('catalog and stock requests', () => {
  it('lists active products in sort order and the settings', async () => {
    await addProduct(ctx.db, { name: 'Вторые', sortOrder: 20 });
    await addProduct(ctx.db, { name: 'Скрытые', sortOrder: 5, isActive: false });
    await addProduct(ctx.db, { name: 'Первые', sortOrder: 10 });

    const list = (await ctx.app.inject({ url: '/api/products' })).json();
    expect(list.map((p: { name: string }) => p.name)).toEqual(['Первые', 'Вторые']);

    const settings = (await ctx.app.inject({ url: '/api/settings' })).json();
    expect(settings).toMatchObject({ courierFeeAmd: 1000, freeDeliveryFromAmd: 10000, aboutText: '' });
  });

  it('saves a "notify me" request and tells the owner', async () => {
    const id = await addProduct(ctx.db, { stockQty: 0, name: 'Манты' });

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/stock-requests',
      payload: { productId: id, name: 'Анна', phone: '+37491123456', telegram: '' },
    });

    expect(response.statusCode).toBe(201);
    const stored = await ctx.db.execute(sql`SELECT product_id, name, phone, telegram, status FROM stock_requests`);
    expect(stored.rows).toEqual([{ product_id: id, name: 'Анна', phone: '+37491123456', telegram: null, status: 'open' }]);
    expect(ctx.sent.stockRequests).toEqual(['Манты']);
  });

  it('rejects a request for an unknown product or with a bad phone', async () => {
    const id = await addProduct(ctx.db);
    const post = (payload: object) => ctx.app.inject({ method: 'POST', url: '/api/stock-requests', payload });

    expect((await post({ productId: 99999, name: 'Анна', phone: '+37491123456' })).statusCode).toBe(404);
    expect((await post({ productId: id, name: 'Анна', phone: 'nope' })).statusCode).toBe(400);
    expect(await countRows(ctx.db, 'stock_requests')).toBe(0);
  });
});
