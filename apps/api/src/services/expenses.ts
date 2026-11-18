import type { Expense, ExpenseInput } from '@alyosha/shared';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { expenses } from '../db/schema';

// «Склад»: what the owner spent money on. The order statistics take it away from the revenue.

type Row = typeof expenses.$inferSelect;

/** How many of the latest expenses the page lists. */
const EXPENSES_SHOWN = 500;

function toExpense(row: Row): Expense {
  return { id: row.id, name: row.name, qty: row.qty, unit: row.unit, amountAmd: row.amountAmd, spentOn: row.spentOn };
}

/** Newest first: by the day spent, then by when it was written down. */
export async function listExpenses(db: Db): Promise<Expense[]> {
  const rows = await db.select().from(expenses).orderBy(desc(expenses.spentOn), desc(expenses.id)).limit(EXPENSES_SHOWN);
  return rows.map(toExpense);
}

export async function createExpense(db: Db, input: ExpenseInput): Promise<Expense> {
  const [row] = await db.insert(expenses).values(input).returning();
  return toExpense(row!);
}

/** Null when there is no such expense. */
export async function updateExpense(db: Db, id: number, input: ExpenseInput): Promise<Expense | null> {
  const [row] = await db
    .update(expenses)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(expenses.id, id))
    .returning();
  return row ? toExpense(row) : null;
}

export async function deleteExpense(db: Db, id: number): Promise<boolean> {
  const removed = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
  return removed.length > 0;
}

/** What was spent from `from` to `to` (YYYY-MM-DD, both included), and on what, most money first. */
export async function expensesInPeriod(db: Db, from: string, to: string) {
  const total = sql<number>`coalesce(sum(${expenses.amountAmd}), 0)::int`;
  const rows = await db
    .select({ name: expenses.name, totalAmd: total, count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(and(gte(expenses.spentOn, from), lte(expenses.spentOn, to)))
    .groupBy(expenses.name)
    .orderBy(desc(total), expenses.name);
  return {
    count: rows.reduce((sum, row) => sum + row.count, 0),
    totalAmd: rows.reduce((sum, row) => sum + row.totalAmd, 0),
    byName: rows.map((row) => ({ name: row.name, totalAmd: row.totalAmd })),
  };
}
