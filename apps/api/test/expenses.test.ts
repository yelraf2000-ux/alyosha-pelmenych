import { shopToday, type Expense, type ExpenseInput } from '@alyosha/shared';
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

const expense = (overrides: Partial<ExpenseInput> = {}): ExpenseInput => ({
  name: 'Говядина',
  qty: 10,
  unit: 'kg',
  amountAmd: 10_000,
  spentOn: shopToday(),
  ...overrides,
});

async function addExpense(overrides: Partial<ExpenseInput> = {}): Promise<Expense> {
  const response = await asAdmin({ method: 'POST', url: '/api/admin/expenses', payload: expense(overrides) });
  expect(response.statusCode).toBe(201);
  return response.json();
}

const stats = (from: string, to: string) => asAdmin({ url: `/api/admin/orders/stats?from=${from}&to=${to}` }).then((r) => r.json());

describe('expenses on «Склад»', () => {
  it('adds, lists newest first, rewrites and deletes an expense', async () => {
    const beef = await addExpense({ name: '  Говядина ', qty: 10, amountAmd: 10_000, spentOn: '2026-11-01' });
    expect(beef).toMatchObject({ name: 'Говядина', qty: 10, unit: 'kg', amountAmd: 10_000, spentOn: '2026-11-01' });
    await addExpense({ name: 'Пакеты', qty: 100, unit: 'pcs', amountAmd: 3000, spentOn: '2026-11-05' });

    const list = (await asAdmin({ url: '/api/admin/expenses' })).json() as Expense[];
    expect(list.map((item) => item.name)).toEqual(['Пакеты', 'Говядина']);

    const rewritten = await asAdmin({ method: 'PUT', url: `/api/admin/expenses/${beef.id}`, payload: expense({ qty: 12.5, amountAmd: 12_500, spentOn: '2026-11-01' }) });
    expect(rewritten.statusCode).toBe(200);
    expect(rewritten.json()).toMatchObject({ qty: 12.5, amountAmd: 12_500 });

    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/expenses/${beef.id}` })).statusCode).toBe(200);
    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/expenses/${beef.id}` })).statusCode).toBe(404);
    expect(((await asAdmin({ url: '/api/admin/expenses' })).json() as Expense[]).map((item) => item.name)).toEqual(['Пакеты']);
  });

  it.each([
    ['an empty name', { name: ' ' }],
    ['no quantity', { qty: 0 }],
    ['an unknown unit', { unit: 'bag' }],
    ['a negative sum', { amountAmd: -1 }],
    ['a sum that is not whole', { amountAmd: 10.5 }],
    ['a date that is not one', { spentOn: '2026-02-30' }],
  ])('refuses %s', async (_name, overrides) => {
    const response = await asAdmin({ method: 'POST', url: '/api/admin/expenses', payload: { ...expense(), ...overrides } });
    expect(response.statusCode).toBe(400);
  });

  it('needs the admin session', async () => {
    expect((await ctx.app.inject({ url: '/api/admin/expenses' })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/admin/expenses', payload: expense() })).statusCode).toBe(401);
  });

  it('counts the expenses of the period in the statistics, by name, most money first', async () => {
    const today = shopToday();
    const product = await addProduct(ctx.db, { priceAmd: 5000, stockQty: 10 });
    expect((await postOrder(ctx.app, orderBody([{ productId: product, qty: 4 }]))).statusCode).toBe(201);

    await addExpense({ name: 'Говядина', amountAmd: 10_000 });
    await addExpense({ name: 'Мука', qty: 5, amountAmd: 2000 });
    await addExpense({ name: 'Говядина', qty: 2, amountAmd: 2400 });
    // Outside the period: not counted.
    await addExpense({ name: 'Говядина', amountAmd: 99_000, spentOn: '2020-01-01' });

    const result = await stats(today, today);
    expect(result.kept.totalAmd).toBe(20_000);
    expect(result.expenses).toEqual({
      count: 3,
      totalAmd: 14_400,
      byName: [
        { name: 'Говядина', totalAmd: 12_400 },
        { name: 'Мука', totalAmd: 2000 },
      ],
    });

    expect((await stats('2026-01-01', '2026-01-02')).expenses).toEqual({ count: 0, totalAmd: 0, byName: [] });
  });
});
