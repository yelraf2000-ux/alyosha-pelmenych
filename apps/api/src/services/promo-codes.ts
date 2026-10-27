import {
  normalizePromoCode,
  promoDiscount,
  shopToday,
  type AdminPromoCode,
  type PromoLine,
  type PromoProblem,
  type ValidPromoCode,
} from '@alyosha/shared';
import { and, count, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { orders, products, promoCodes } from '../db/schema';

// The owner's promo codes. A code is used up by orders, and only by orders that still stand: a
// cancelled or deleted order gives its use back. So the count is always taken from the orders,
// never kept in a counter that could drift from them.

type PromoRow = typeof promoCodes.$inferSelect;

export type PromoOutcome = { ok: true; promo: PromoRow; discountAmd: number } | { ok: false; problem: PromoProblem };

const notCancelled = ne(orders.status, 'cancelled');

async function usesOf(db: Db | Tx, promoId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.promoCodeId, promoId), notCancelled));
  return row?.n ?? 0;
}

/**
 * Whether `rawCode` works today for these lines, and what it takes off them.
 *
 * With `lock` the code's row stays locked until the surrounding transaction ends: a second order
 * with the same code waits, then counts the first one's use, so a code limited to one use can
 * never be used twice.
 */
export async function evaluatePromo(
  db: Db | Tx,
  rawCode: string,
  lines: readonly PromoLine[],
  { lock = false, now = new Date() }: { lock?: boolean; now?: Date } = {},
): Promise<PromoOutcome> {
  const byCode = db.select().from(promoCodes).where(eq(promoCodes.code, normalizePromoCode(rawCode)));
  const [promo] = lock ? await byCode.for('update') : await byCode;

  // A switched-off code answers like a code that does not exist: nothing to learn from guessing.
  if (!promo || !promo.isActive) return { ok: false, problem: 'not_found' };
  if (promo.validUntil !== null && promo.validUntil < shopToday(now)) return { ok: false, problem: 'expired' };
  if (promo.maxUses !== null && (await usesOf(db, promo.id)) >= promo.maxUses) return { ok: false, problem: 'used_up' };

  const discountAmd = promoDiscount(promo, lines);
  if (discountAmd === 0) return { ok: false, problem: 'not_applicable' };
  return { ok: true, promo, discountAmd };
}

/** The cart's lines with the prices and categories the shop has now; unknown or hidden products are left out. */
export async function promoLinesFor(db: Db, items: readonly { productId: number; qty: number }[]): Promise<PromoLine[]> {
  const ids = [...new Set(items.map((item) => item.productId))];
  const rows = await db
    .select({ id: products.id, category: products.category, priceAmd: products.priceAmd })
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.isActive, true)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return items.flatMap((item) => {
    const product = byId.get(item.productId);
    return product ? [{ productId: product.id, category: product.category, priceAmd: product.priceAmd, qty: item.qty }] : [];
  });
}

// ---------- The admin ----------

function toAdmin(row: PromoRow, usage: { uses: number; given: number } | undefined): AdminPromoCode {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    value: row.value,
    categories: row.categories,
    productIds: row.productIds,
    maxUses: row.maxUses,
    validUntil: row.validUntil,
    isActive: row.isActive,
    uses: usage?.uses ?? 0,
    discountGivenAmd: usage?.given ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

async function usage(db: Db, ids?: number[]) {
  const rows = await db
    .select({
      id: orders.promoCodeId,
      uses: count(),
      given: sql<number>`coalesce(sum(${orders.discountAmd}), 0)::int`,
    })
    .from(orders)
    .where(and(isNotNull(orders.promoCodeId), notCancelled, ids ? inArray(orders.promoCodeId, ids) : undefined))
    .groupBy(orders.promoCodeId);
  return new Map(rows.map((row) => [row.id!, { uses: row.uses, given: row.given }]));
}

/** Newest first. */
export async function listPromoCodes(db: Db): Promise<AdminPromoCode[]> {
  const rows = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt), desc(promoCodes.id));
  const used = await usage(db);
  return rows.map((row) => toAdmin(row, used.get(row.id)));
}

async function getPromoCode(db: Db, id: number): Promise<AdminPromoCode | null> {
  const [row] = await db.select().from(promoCodes).where(eq(promoCodes.id, id));
  return row ? toAdmin(row, (await usage(db, [id])).get(id)) : null;
}

export type SavePromoResult = { ok: true; promo: AdminPromoCode } | { ok: false; error: 'not_found' | 'code_taken' };

function isCodeTaken(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

/** Creates a code (`id` null) or rewrites one; the code's text must not belong to another one. */
export async function savePromoCode(db: Db, id: number | null, input: ValidPromoCode): Promise<SavePromoResult> {
  const [clash] = await db.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, input.code));
  if (clash && clash.id !== id) return { ok: false, error: 'code_taken' };

  // Repeats in the lists mean nothing; they are dropped so the admin shows each once.
  const values = { ...input, categories: [...new Set(input.categories)], productIds: [...new Set(input.productIds)] };
  try {
    if (id === null) {
      const [created] = await db.insert(promoCodes).values(values).returning({ id: promoCodes.id });
      return { ok: true, promo: (await getPromoCode(db, created!.id))! };
    }
    const [saved] = await db
      .update(promoCodes)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(promoCodes.id, id))
      .returning({ id: promoCodes.id });
    if (!saved) return { ok: false, error: 'not_found' };
    return { ok: true, promo: (await getPromoCode(db, id))! };
  } catch (error) {
    // Two saves of the same new code at once: the database keeps codes unique either way.
    if (isCodeTaken(error)) return { ok: false, error: 'code_taken' };
    throw error;
  }
}

/** Orders placed with it keep its text and their discount (the link to it is cleared). */
export async function deletePromoCode(db: Db, id: number): Promise<boolean> {
  const removed = await db.delete(promoCodes).where(eq(promoCodes.id, id)).returning({ id: promoCodes.id });
  return removed.length > 0;
}
