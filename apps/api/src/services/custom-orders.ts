import { optionLines, type AdminCustomOrder, type OrderStatus, type ValidCustomOrder } from '@alyosha/shared';
import { count, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { customOrders } from '../db/schema';
import { newNotifyToken } from './buyer-bot';
import { getSettings } from './settings';

type Row = typeof customOrders.$inferSelect;

function toView(row: Row): AdminCustomOrder {
  return {
    id: row.id,
    publicNumber: row.publicNumber,
    status: row.status,
    recipeName: row.recipeName,
    base: row.base,
    modifiers: row.modifiers,
    spices: row.spices,
    weightGrams: row.weightGrams,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerTelegram: row.customerTelegram,
    comment: row.comment,
    telegramLinked: row.telegramChatId !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getCustomOrder(db: Db, id: number): Promise<AdminCustomOrder | null> {
  const [row] = await db.select().from(customOrders).where(eq(customOrders.id, id));
  return row ? toView(row) : null;
}

export type PlaceCustomOrderResult =
  /** `notifyToken`: the secret for the request's link to the Telegram bot. */
  | { ok: true; order: AdminCustomOrder; notifyToken: string }
  /** `unavailable`: the shop offers no bases, which is how the owner switches the feature off. */
  | { ok: false; error: 'invalid' | 'unavailable' };

/** Stores a «Свой рецепт» request, if everything chosen is something the shop offers right now. */
export async function placeCustomOrder(db: Db, input: ValidCustomOrder): Promise<PlaceCustomOrderResult> {
  const settings = await getSettings(db);
  const bases = optionLines(settings.customBases);
  if (bases.length === 0) return { ok: false, error: 'unavailable' };

  const modifiers = [...new Set(input.modifiers)];
  const spices = [...new Set(input.spices)];
  const offeredModifiers = optionLines(settings.customModifiers);
  const offeredSpices = optionLines(settings.customSpices);
  if (
    !bases.includes(input.base) ||
    modifiers.some((option) => !offeredModifiers.includes(option)) ||
    spices.some((option) => !offeredSpices.includes(option))
  ) {
    return { ok: false, error: 'invalid' };
  }

  const notifyToken = newNotifyToken();
  const [row] = await db
    .insert(customOrders)
    .values({
      notifyToken,
      recipeName: input.recipeName,
      base: input.base,
      modifiers,
      spices,
      weightGrams: input.weightGrams,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerTelegram: input.customerTelegram,
      comment: input.comment,
    })
    .returning();
  return { ok: true, order: toView(row!), notifyToken };
}

/** Newest first. A small shop: the latest 200 are plenty for one page. */
export async function listCustomOrders(db: Db): Promise<AdminCustomOrder[]> {
  const rows = await db.select().from(customOrders).orderBy(desc(customOrders.createdAt), desc(customOrders.id)).limit(200);
  return rows.map(toView);
}

export async function setCustomOrderStatus(db: Db, id: number, status: OrderStatus): Promise<AdminCustomOrder | null> {
  const [row] = await db
    .update(customOrders)
    .set({ status, updatedAt: new Date() })
    .where(eq(customOrders.id, id))
    .returning();
  return row ? toView(row) : null;
}

/** Removes a request for good; false when there is no such request. The buyer is told nothing. */
export async function deleteCustomOrder(db: Db, id: number): Promise<boolean> {
  const removed = await db.delete(customOrders).where(eq(customOrders.id, id)).returning({ id: customOrders.id });
  return removed.length > 0;
}

export async function countNewCustomOrders(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(customOrders).where(eq(customOrders.status, 'new'));
  return row?.n ?? 0;
}
