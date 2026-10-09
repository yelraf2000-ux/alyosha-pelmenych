import { calcDeliveryFee, isDeliveryExtra, type OrderView, type StockShortage, type ValidOrder } from '@alyosha/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { orderItems, orders, products } from '../db/schema';
import { newNotifyToken } from './buyer-bot';
import { getSettings } from './settings';

export type PlaceOrderResult =
  /** `notifyToken`: the secret for the order's link to the Telegram bot (the route builds the link). */
  | { ok: true; id: number; order: OrderView; customer: OrderCustomer; notifyToken: string }
  | { ok: false; error: 'insufficient_stock'; shortages: StockShortage[] };

export interface OrderCustomer {
  name: string;
  phone: string;
  telegram: string | null;
  comment: string | null;
}

/**
 * Places an order without ever overselling (SPEC §6).
 *
 * Everything happens in one transaction. The product rows are locked with SELECT … FOR UPDATE,
 * so a second buyer ordering the same product waits here until the first transaction commits
 * and then sees the reduced stock. Rows are locked in id order, so two orders with the same
 * products in a different order cannot deadlock.
 */
export async function placeOrder(db: Db, order: ValidOrder): Promise<PlaceOrderResult> {
  // The same product may come in twice; treat it as one line.
  const wanted = new Map<number, number>();
  for (const item of order.items) {
    wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.qty);
  }
  const ids = [...wanted.keys()].sort((a, b) => a - b);

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(products).where(inArray(products.id, ids)).orderBy(products.id).for('update');
    const byId = new Map(rows.map((row) => [row.id, row]));

    const shortages: StockShortage[] = [];
    for (const id of ids) {
      const product = byId.get(id);
      const available = product?.isActive ? product.stockQty : 0;
      if (wanted.get(id)! > available) {
        shortages.push({ productId: id, name: product?.name ?? 'Товар', available });
      }
    }
    if (shortages.length > 0) {
      return { ok: false, error: 'insufficient_stock', shortages };
    }

    const items = ids.map((id) => {
      const product = byId.get(id)!;
      return { productId: id, name: product.name, priceAmd: product.priceAmd, qty: wanted.get(id)! };
    });

    for (const item of items) {
      await tx
        .update(products)
        .set({ stockQty: sql`${products.stockQty} - ${item.qty}`, updatedAt: new Date() })
        .where(eq(products.id, item.productId));
    }

    // Prices and the delivery fee are taken from the database, never from the request.
    const itemsTotalAmd = items.reduce((sum, item) => sum + item.priceAmd * item.qty, 0);
    const settings = await getSettings(tx);
    const deliveryFeeAmd = calcDeliveryFee(order.deliveryMethod, itemsTotalAmd, settings);
    const deliveryExtra = isDeliveryExtra(order.deliveryMethod, itemsTotalAmd, settings);
    const deliveryAddress = order.deliveryMethod === 'courier' ? order.deliveryAddress : null;

    const notifyToken = newNotifyToken();
    const [created] = await tx
      .insert(orders)
      .values({
        notifyToken,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerTelegram: order.customerTelegram,
        comment: order.comment,
        deliveryMethod: order.deliveryMethod,
        deliveryAddress,
        itemsTotalAmd,
        deliveryFeeAmd,
        deliveryExtra,
        totalAmd: itemsTotalAmd + deliveryFeeAmd,
      })
      .returning({ id: orders.id, publicNumber: orders.publicNumber });

    await tx.insert(orderItems).values(
      items.map((item) => ({
        orderId: created!.id,
        productId: item.productId,
        productNameSnapshot: item.name,
        priceAmdSnapshot: item.priceAmd,
        qty: item.qty,
      })),
    );

    return {
      ok: true,
      id: created!.id,
      order: {
        publicNumber: created!.publicNumber,
        items,
        itemsTotalAmd,
        deliveryFeeAmd,
        deliveryExtra,
        totalAmd: itemsTotalAmd + deliveryFeeAmd,
        deliveryMethod: order.deliveryMethod,
        deliveryAddress,
        telegramLink: null,
      },
      notifyToken,
      customer: {
        name: order.customerName,
        phone: order.customerPhone,
        telegram: order.customerTelegram,
        comment: order.comment,
      },
    };
  });
}
