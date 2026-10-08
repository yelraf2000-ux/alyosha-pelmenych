import type {
  AdminOrder,
  AdminOrderSummary,
  ChangeOrderStatusResult,
  OrderStatus,
  StockShortage,
  TodayView,
} from '@alyosha/shared';
import { asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
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
