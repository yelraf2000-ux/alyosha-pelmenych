import {
  calcDeliveryFee,
  isDeliveryExtra,
  ORDER_STATUSES,
  promoDiscount,
  SHOP_TIME_ZONE,
  type AdminOrder,
  type AdminOrderSummary,
  type ChangeOrderStatusResult,
  type OrderCountAndSum,
  type OrderStats,
  type OrderStatus,
  type StockShortage,
  type TodayView,
  type ValidOrderEdit,
} from '@alyosha/shared';
import { and, asc, count, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { customOrders, orderItems, orders, products, promoCodes } from '../db/schema';
import { getSettings } from './settings';

type OrderRow = typeof orders.$inferSelect;

// Written with explicit table names: inside a sub-select Drizzle would print the bare column
// name `id`, which Postgres resolves to order_items.id instead of orders.id.
const itemsCount = sql<number>`(
  select coalesce(sum(oi.qty), 0)::int from order_items oi where oi.order_id = orders.id
)`;

function toSummary(row: OrderRow, items: number): AdminOrderSummary {
  return {
    id: row.id,
    publicNumber: row.publicNumber,
    status: row.status,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    deliveryMethod: row.deliveryMethod,
    totalAmd: row.totalAmd,
    itemsCount: items,
    isPreorder: row.isPreorder,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listOrders(
  db: Db,
  options: { status?: OrderStatus; limit: number; offset: number },
): Promise<AdminOrderSummary[]> {
  const rows = await db
    .select({ order: orders, itemsCount })
    .from(orders)
    .where(options.status ? eq(orders.status, options.status) : sql`true`)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(options.limit)
    .offset(options.offset);
  return rows.map((row) => toSummary(row.order, row.itemsCount));
}

export async function getOrder(db: Db | Tx, id: number): Promise<AdminOrder | null> {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  if (!row) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.id));
  return {
    ...toSummary(
      row,
      items.reduce((sum, item) => sum + item.qty, 0),
    ),
    customerTelegram: row.customerTelegram,
    comment: row.comment,
    deliveryAddress: row.deliveryAddress,
    itemsTotalAmd: row.itemsTotalAmd,
    discountAmd: row.discountAmd,
    promoCode: row.promoCode,
    deliveryFeeAmd: row.deliveryFeeAmd,
    deliveryExtra: row.deliveryExtra,
    items: items.map((item) => ({
      productId: item.productId,
      name: item.productNameSnapshot,
      priceAmd: item.priceAmdSnapshot,
      qty: item.qty,
      preorderQty: item.preorderQty,
    })),
    telegramLinked: row.telegramChatId !== null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

type ItemRow = typeof orderItems.$inferSelect;

/** What a line has taken out of the stock: all of it but the part made to order. */
const held = (item: Pick<ItemRow, 'qty' | 'preorderQty'>) => item.qty - item.preorderQty;

/** Locks the products, always in id order: the order every transaction here locks them in. */
function lockProducts(tx: Tx, ids: number[]) {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  return sorted.length
    ? tx.select().from(products).where(inArray(products.id, sorted)).orderBy(products.id).for('update')
    : Promise.resolve([]);
}

async function moveStock(tx: Tx, productId: number, delta: number) {
  if (delta === 0) return;
  await tx
    .update(products)
    .set({ stockQty: sql`${products.stockQty} + ${delta}`, updatedAt: new Date() })
    .where(eq(products.id, productId));
}

/**
 * Changes an order's status and keeps stock consistent with it (SPEC §7), in one transaction.
 * Cancelling puts back what the order took from the stock (not its made-to-order part).
 * Reopening a cancelled order takes it out again; what is no longer there becomes made to order
 * when pre-orders are on, and refuses the change when they are off.
 */
export async function changeOrderStatus(db: Db, id: number, next: OrderStatus): Promise<ChangeOrderStatusResult> {
  return db.transaction(async (tx) => {
    // The order row is locked first, so two status changes for one order run one after another
    // and stock can never be returned twice.
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!order) return { ok: false, error: 'not_found' };

    const cancelling = next === 'cancelled' && order.status !== 'cancelled';
    const reopening = next !== 'cancelled' && order.status === 'cancelled';

    if (cancelling || reopening) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.id));
      const rows = await lockProducts(
        tx,
        items.map((item) => item.productId),
      );

      if (cancelling) {
        for (const item of items) await moveStock(tx, item.productId, held(item));
      } else {
        const { preorderEnabled } = await getSettings(tx);
        const left = new Map(rows.map((product) => [product.id, product.stockQty]));
        const shortages: StockShortage[] = [];
        const plan = items.map((item) => {
          const have = left.get(item.productId) ?? 0;
          const take = Math.min(held(item), have);
          if (take < held(item) && !preorderEnabled) {
            const product = rows.find((row) => row.id === item.productId);
            shortages.push({ productId: item.productId, name: product?.name ?? item.productNameSnapshot, available: have });
          }
          left.set(item.productId, have - take);
          return { item, take };
        });
        if (shortages.length > 0) return { ok: false, error: 'insufficient_stock', shortages };

        for (const { item, take } of plan) {
          await moveStock(tx, item.productId, -take);
          const preorderQty = item.qty - take;
          if (preorderQty !== item.preorderQty) {
            await tx.update(orderItems).set({ preorderQty }).where(eq(orderItems.id, item.id));
          }
        }
        const isPreorder = plan.some(({ item, take }) => item.qty > take);
        await tx.update(orders).set({ isPreorder }).where(eq(orders.id, id));
      }
    }

    if (next !== order.status) {
      await tx.update(orders).set({ status: next, updatedAt: new Date() }).where(eq(orders.id, id));
    }
    return { ok: true, order: (await getOrder(tx, id))! };
  });
}

export type EditOrderResult =
  | { ok: true; order: AdminOrder }
  /** `items_locked`: a completed or cancelled order keeps its goods as they were. */
  | { ok: false; error: 'not_found' | 'items_locked' }
  | { ok: false; error: 'insufficient_stock'; shortages: StockShortage[] };

/**
 * The owner rewrites an order: the buyer's details, the delivery, and the goods.
 *
 * The goods can change only while the order holds them (new or confirmed): the stock moves by
 * the difference, the order's own goods count as available to it, and with pre-orders on what is
 * not in stock is made to order, as when buying. Lines that were there keep the price and name
 * they were bought at; new ones take today's. The promo code's discount is worked out again for
 * the new goods (without asking whether the code is still valid: the buyer had it); a deleted
 * code keeps its discount, but never more than the goods. Delivery is worked out again only when
 * the goods or the way of delivery change.
 */
export async function editOrder(db: Db, id: number, input: ValidOrderEdit): Promise<EditOrderResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!order) return { ok: false, error: 'not_found' };
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.id));

    const wanted = new Map(input.items.map((item) => [item.productId, item.qty]));
    const sameGoods = items.length === wanted.size && items.every((item) => wanted.get(item.productId) === item.qty);
    const holdsGoods = order.status === 'new' || order.status === 'confirmed';
    if (!sameGoods && !holdsGoods) return { ok: false, error: 'items_locked' };

    const settings = await getSettings(tx);
    type Line = { productId: number; name: string; priceAmd: number; qty: number; preorderQty: number };
    let lines: Line[] = items.map((item) => ({
      productId: item.productId,
      name: item.productNameSnapshot,
      priceAmd: item.priceAmdSnapshot,
      qty: item.qty,
      preorderQty: item.preorderQty,
    }));

    if (!sameGoods) {
      const rows = await lockProducts(tx, [...items.map((item) => item.productId), ...wanted.keys()]);
      const byId = new Map(rows.map((row) => [row.id, row]));
      const oldBy = new Map(items.map((item) => [item.productId, item]));
      const shortages: StockShortage[] = [];
      const moves: [number, number][] = [];
      const next: Line[] = [];

      for (const [productId, qty] of wanted) {
        const old = oldBy.get(productId);
        const product = byId.get(productId);
        // A product that was not in the order can be added only while it is on sale.
        if (!old && !product?.isActive) {
          shortages.push({ productId, name: product?.name ?? 'Товар', available: 0 });
          continue;
        }
        const mine = old ? held(old) : 0;
        const available = (product?.stockQty ?? 0) + mine;
        const take = Math.min(qty, available);
        if (take < qty && !settings.preorderEnabled) {
          shortages.push({ productId, name: product?.name ?? old!.productNameSnapshot, available });
        }
        moves.push([productId, mine - take]);
        next.push({
          productId,
          name: old?.productNameSnapshot ?? product!.name,
          priceAmd: old?.priceAmdSnapshot ?? product!.priceAmd,
          qty,
          preorderQty: qty - take,
        });
      }
      for (const old of items) if (!wanted.has(old.productId)) moves.push([old.productId, held(old)]);
      if (shortages.length > 0) return { ok: false, error: 'insufficient_stock', shortages };

      for (const [productId, delta] of moves) await moveStock(tx, productId, delta);
      await tx.delete(orderItems).where(eq(orderItems.orderId, id));
      await tx.insert(orderItems).values(
        next.map((line) => ({
          orderId: id,
          productId: line.productId,
          productNameSnapshot: line.name,
          priceAmdSnapshot: line.priceAmd,
          qty: line.qty,
          preorderQty: line.preorderQty,
        })),
      );
      lines = next;
    }

    const itemsTotalAmd = lines.reduce((sum, line) => sum + line.priceAmd * line.qty, 0);

    let discountAmd = order.discountAmd;
    if (!sameGoods && order.promoCodeId !== null) {
      const [promo] = await tx.select().from(promoCodes).where(eq(promoCodes.id, order.promoCodeId));
      if (promo) {
        const categories = await tx
          .select({ id: products.id, category: products.category })
          .from(products)
          .where(inArray(products.id, lines.map((line) => line.productId)));
        const categoryOf = new Map(categories.map((row) => [row.id, row.category]));
        discountAmd = promoDiscount(promo, lines.map((line) => ({ ...line, category: categoryOf.get(line.productId) ?? '' })));
      }
    }
    discountAmd = Math.min(discountAmd, itemsTotalAmd);

    const deliveryChanged = !sameGoods || input.deliveryMethod !== order.deliveryMethod;
    const deliveryFeeAmd = deliveryChanged ? calcDeliveryFee(input.deliveryMethod, itemsTotalAmd, settings) : order.deliveryFeeAmd;
    const deliveryExtra = deliveryChanged ? isDeliveryExtra(input.deliveryMethod, itemsTotalAmd, settings) : order.deliveryExtra;

    await tx
      .update(orders)
      .set({
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerTelegram: input.customerTelegram,
        comment: input.comment,
        deliveryMethod: input.deliveryMethod,
        deliveryAddress: input.deliveryMethod === 'courier' ? input.deliveryAddress : null,
        itemsTotalAmd,
        discountAmd,
        deliveryFeeAmd,
        deliveryExtra,
        totalAmd: itemsTotalAmd - discountAmd + deliveryFeeAmd,
        isPreorder: lines.some((line) => line.preorderQty > 0),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));
    return { ok: true, order: (await getOrder(tx, id))! };
  });
}

/**
 * Removes an order for good, with its lines. For orders placed to try the shop out, and for
 * mistakes: the buyer is told nothing, and the order leaves the statistics. A real order that
 * fell through is cancelled instead.
 *
 * Stock follows what the order was holding. A new or confirmed order still has its goods set
 * aside, so they go back on the shelf, as cancelling would put them. A completed order handed
 * its goods over, and a cancelled one has returned them already: neither changes the stock.
 */
export async function deleteOrder(db: Db, id: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Locked like a status change, so the two cannot both return the same goods.
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!order) return false;

    if (order.status === 'new' || order.status === 'confirmed') {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
      // Same lock order as placing an order (by product id), so the two cannot deadlock.
      await lockProducts(
        tx,
        items.map((item) => item.productId),
      );
      // Only what came out of the stock goes back: the made-to-order part never was in it.
      for (const item of items) await moveStock(tx, item.productId, held(item));
    }

    // The order's lines go with it (ON DELETE CASCADE).
    await tx.delete(orders).where(eq(orders.id, id));
    return true;
  });
}

/** SPEC §7 "today view": how many orders are waiting and how much of each product they need. */
export async function getToday(db: Db): Promise<Omit<TodayView, 'newCustomOrders'>> {
  const active: OrderStatus[] = ['new', 'confirmed'];

  const byStatus = await db
    .select({ status: orders.status, n: count() })
    .from(orders)
    .where(inArray(orders.status, active))
    .groupBy(orders.status);

  const totals = await db
    .select({
      productId: orderItems.productId,
      name: products.name,
      qty: sql<number>`sum(${orderItems.qty})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(products, eq(products.id, orderItems.productId))
    .where(inArray(orders.status, active))
    .groupBy(orderItems.productId, products.name, products.sortOrder)
    .orderBy(asc(products.sortOrder), asc(orderItems.productId));

  return {
    newOrders: byStatus.find((row) => row.status === 'new')?.n ?? 0,
    confirmedOrders: byStatus.find((row) => row.status === 'confirmed')?.n ?? 0,
    totals,
  };
}

/**
 * Statistics for the orders placed from `from` to `to` (YYYY-MM-DD, both days included).
 * A day is a day on the shop's clock, so an order placed at 00:30 in Yerevan counts for the new
 * day even though it is still the evening before in UTC.
 */
export async function getOrderStats(db: Db, from: string, to: string): Promise<OrderStats> {
  // Written into the query as a literal (it is our own constant): as a parameter it would get a
  // new number at every use, and Postgres would not see that SELECT and GROUP BY name the same day.
  const zone = sql.raw(`'${SHOP_TIME_ZONE}'`);
  const inPeriod = and(
    sql`${orders.createdAt} >= (${from}::date)::timestamp AT TIME ZONE ${zone}`,
    sql`${orders.createdAt} < (${to}::date + 1)::timestamp AT TIME ZONE ${zone}`,
  );
  const sum = sql<number>`coalesce(sum(${orders.totalAmd}), 0)::int`;
  const notCancelled = ne(orders.status, 'cancelled');

  const statusRows = await db
    .select({ status: orders.status, count: count(), totalAmd: sum })
    .from(orders)
    .where(inPeriod)
    .groupBy(orders.status);

  const methodRows = await db
    .select({ method: orders.deliveryMethod, count: count() })
    .from(orders)
    .where(and(inPeriod, notCancelled))
    .groupBy(orders.deliveryMethod);

  const qty = sql<number>`sum(${orderItems.qty})::int`;
  const productRows = await db
    .select({
      productId: orderItems.productId,
      // The name as it was when ordered; if it was renamed in between, the latest spelling.
      name: sql<string>`(array_agg(${orderItems.productNameSnapshot} ORDER BY ${orderItems.id} DESC))[1]`,
      qty,
      totalAmd: sql<number>`sum(${orderItems.qty} * ${orderItems.priceAmdSnapshot})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(inPeriod, notCancelled))
    .groupBy(orderItems.productId)
    .orderBy(desc(qty), asc(orderItems.productId));

  const day = sql<string>`to_char(${orders.createdAt} AT TIME ZONE ${zone}, 'YYYY-MM-DD')`;
  const dayRows = await db
    .select({
      date: day,
      count: sql<number>`count(*) FILTER (WHERE ${orders.status} <> 'cancelled')::int`,
      cancelledCount: sql<number>`count(*) FILTER (WHERE ${orders.status} = 'cancelled')::int`,
      totalAmd: sql<number>`coalesce(sum(${orders.totalAmd}) FILTER (WHERE ${orders.status} <> 'cancelled'), 0)::int`,
    })
    .from(orders)
    .where(inPeriod)
    .groupBy(day)
    .orderBy(day);

  // «Свой рецепт» requests of the same days; only a priced one adds to the money.
  const recipeInPeriod = and(
    sql`${customOrders.createdAt} >= (${from}::date)::timestamp AT TIME ZONE ${zone}`,
    sql`${customOrders.createdAt} < (${to}::date + 1)::timestamp AT TIME ZONE ${zone}`,
    ne(customOrders.status, 'cancelled'),
  );
  const [recipes] = await db
    .select({
      count: count(),
      pricedCount: sql<number>`count(${customOrders.priceAmd})::int`,
      totalAmd: sql<number>`coalesce(sum(${customOrders.priceAmd}), 0)::int`,
    })
    .from(customOrders)
    .where(recipeInPeriod);

  // By the code's text on the order, so a code deleted since still has its line.
  const promoRows = await db
    .select({
      code: orders.promoCode,
      count: count(),
      discountAmd: sql<number>`coalesce(sum(${orders.discountAmd}), 0)::int`,
      totalAmd: sum,
    })
    .from(orders)
    .where(and(inPeriod, notCancelled, isNotNull(orders.promoCode)))
    .groupBy(orders.promoCode)
    .orderBy(desc(count()), asc(orders.promoCode));

  const byStatus = Object.fromEntries(
    ORDER_STATUSES.map((status) => {
      const row = statusRows.find((item) => item.status === status);
      return [status, { count: row?.count ?? 0, totalAmd: row?.totalAmd ?? 0 }];
    }),
  ) as Record<OrderStatus, OrderCountAndSum>;
  const add = (statuses: readonly OrderStatus[]): OrderCountAndSum => ({
    count: statuses.reduce((total, status) => total + byStatus[status].count, 0),
    totalAmd: statuses.reduce((total, status) => total + byStatus[status].totalAmd, 0),
  });

  return {
    from,
    to,
    placed: add(ORDER_STATUSES),
    kept: add(ORDER_STATUSES.filter((status) => status !== 'cancelled')),
    cancelled: byStatus.cancelled,
    byStatus,
    pickupCount: methodRows.find((row) => row.method === 'pickup')?.count ?? 0,
    courierCount: methodRows.find((row) => row.method === 'courier')?.count ?? 0,
    products: productRows,
    days: dayRows,
    promoCodes: promoRows.map((row) => ({ ...row, code: row.code ?? '' })),
    recipes: recipes ?? { count: 0, pricedCount: 0, totalAmd: 0 },
  };
}
