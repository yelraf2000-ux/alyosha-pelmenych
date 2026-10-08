import {
  ORDER_STATUSES,
  SHOP_TIME_ZONE,
  type AdminOrder,
  type AdminOrderSummary,
  type ChangeOrderStatusResult,
  type OrderCountAndSum,
  type OrderStats,
  type OrderStatus,
  type StockShortage,
  type TodayView,
} from '@alyosha/shared';
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { orderItems, orders, products } from '../db/schema';

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
    deliveryFeeAmd: row.deliveryFeeAmd,
    deliveryExtra: row.deliveryExtra,
    items: items.map((item) => ({
      productId: item.productId,
      name: item.productNameSnapshot,
      priceAmd: item.priceAmdSnapshot,
      qty: item.qty,
    })),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Changes an order's status and keeps stock consistent with it (SPEC §7), in one transaction:
 * cancelling puts the items back in stock; reopening a cancelled order takes them out again,
 * and is refused when they are no longer available.
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
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
      const qtyBy = new Map<number, number>();
      for (const item of items) qtyBy.set(item.productId, (qtyBy.get(item.productId) ?? 0) + item.qty);
      const ids = [...qtyBy.keys()].sort((a, b) => a - b);

      // Same lock order as placing an order (by product id), so the two cannot deadlock.
      const rows = ids.length
        ? await tx.select().from(products).where(inArray(products.id, ids)).orderBy(products.id).for('update')
        : [];

      if (reopening) {
        const shortages: StockShortage[] = rows
          .filter((product) => product.stockQty < qtyBy.get(product.id)!)
          .map((product) => ({ productId: product.id, name: product.name, available: product.stockQty }));
        if (shortages.length > 0) return { ok: false, error: 'insufficient_stock', shortages };
      }

      for (const product of rows) {
        const qty = qtyBy.get(product.id)!;
        await tx
          .update(products)
          .set({ stockQty: sql`${products.stockQty} + ${cancelling ? qty : -qty}`, updatedAt: new Date() })
          .where(eq(products.id, product.id));
      }
    }

    if (next !== order.status) {
      await tx.update(orders).set({ status: next, updatedAt: new Date() }).where(eq(orders.id, id));
    }
    return { ok: true, order: (await getOrder(tx, id))! };
  });
}

/** SPEC §7 "today view": how many orders are waiting and how much of each product they need. */
export async function getToday(db: Db): Promise<TodayView> {
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
  };
}
