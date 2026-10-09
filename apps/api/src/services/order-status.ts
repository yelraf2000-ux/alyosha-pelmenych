import type { AdminCustomOrder, ChangeOrderStatusResult, OrderStatus } from '@alyosha/shared';
import type { Db } from '../db/client';
import { changeOrderStatus, getOrder } from './admin-orders';
import {
  contactButton,
  customOrderChatId,
  customStatusText,
  orderChatId,
  orderStatusText,
  type BuyerBot,
} from './buyer-bot';
import { getCustomOrder, setCustomOrderStatus } from './custom-orders';
import { getSettings } from './settings';

// Changing a status is done from two places, the admin panel and the buttons in the owner's
// Telegram chat. Both go through here, so the buyer who connected the bot is told either way.

/** Changes an order's status (stock follows, see `changeOrderStatus`) and tells the buyer if it really changed. */
export async function changeOrderStatusAndTell(
  db: Db,
  bot: BuyerBot | null,
  id: number,
  next: OrderStatus,
): Promise<ChangeOrderStatusResult> {
  const before = bot ? await getOrder(db, id) : null;
  const result = await changeOrderStatus(db, id, next);
  if (bot && result.ok && before && before.status !== result.order.status) {
    const chatId = await orderChatId(db, id);
    if (chatId !== null) void bot.send(chatId, orderStatusText(result.order), contactButton(await getSettings(db)));
  }
  return result;
}

/** The same for a «Свой рецепт» request; null when there is no such request. */
export async function changeCustomStatusAndTell(
  db: Db,
  bot: BuyerBot | null,
  id: number,
  next: OrderStatus,
): Promise<AdminCustomOrder | null> {
  const before = bot ? await getCustomOrder(db, id) : null;
  const order = await setCustomOrderStatus(db, id, next);
  if (bot && order && before && before.status !== order.status) {
    const chatId = await customOrderChatId(db, id);
    if (chatId !== null) void bot.send(chatId, customStatusText(order), contactButton(await getSettings(db)));
  }
  return order;
}
