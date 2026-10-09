import { ADMIN_PASSWORD_RESET_MINUTES, type OrderStatus } from '@alyosha/shared';
import type { AdminAuth } from '../auth';
import type { Db } from '../db/client';
import { customKeyboard, formatCustomOrderMessage, formatOrderMessage, orderKeyboard, parseAction } from '../notify';
import { getOrder, listOrders } from './admin-orders';
import { startPasswordReset } from './admin-password';
import type { BuyerBot } from './buyer-bot';
import { listCustomOrders } from './custom-orders';
import { changeCustomStatusAndTell, changeOrderStatusAndTell } from './order-status';

/**
 * The shop run from Telegram. In an admin chat (TELEGRAM_CHAT_ID: the owner's own chat, or a
 * group of his) every order arrives with buttons under it; pressing one changes the order's
 * status exactly as the admin panel would, and the message is rewritten to show the new status.
 */

const DONE: Record<OrderStatus, string> = {
  new: 'возвращён в новые',
  confirmed: 'подтверждён',
  done: 'выполнен',
  cancelled: 'отменён',
};

export const ADMIN_HELP_TEXT = [
  '<b>Это чат администратора магазина.</b>',
  'Сюда приходят новые заказы, заявки «Свой рецепт» и «Сообщить о поступлении». Под заказом есть кнопки: подтвердить, выполнить, отменить.',
  '',
  '/orders — открытые заказы',
  '/password — задать новый пароль от админки, если старый забыт',
].join('\n');

export const PASSWORD_CHANGED_TEXT =
  '🔑 Пароль от админки изменён. Если это сделали не вы, отправьте /password и задайте новый.';

export function isAdminChat(bot: BuyerBot, chatId: unknown): chatId is number {
  return typeof chatId === 'number' && bot.adminChatIds.includes(chatId);
}

interface Callback {
  id?: unknown;
  data?: unknown;
  message?: { message_id?: unknown; chat?: { id?: unknown } };
}

/** A button under an order was pressed. */
export async function handleAdminCallback(db: Db, bot: BuyerBot, callback: Callback): Promise<void> {
  if (typeof callback.id !== 'string') return;
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  // The buttons work only where the shop sent them: a forwarded message gives nobody the shop's keys.
  if (!isAdminChat(bot, chatId)) return bot.answer(callback.id, 'Эти кнопки только для администратора магазина.', true);

  const action = parseAction(callback.data);
  if (!action) return bot.answer(callback.id, 'Эта кнопка устарела.', true);

  if (action.kind === 'order') {
    const result = await changeOrderStatusAndTell(db, bot, action.id, action.status);
    if (!result.ok) {
      const why =
        result.error === 'not_found'
          ? 'Такого заказа больше нет.'
          : `Не хватает товара на складе: ${result.shortages.map((item) => `${item.name} (есть ${item.available})`).join(', ')}.`;
      return bot.answer(callback.id, why, true);
    }
    if (typeof messageId === 'number') {
      void bot.edit(chatId, messageId, formatOrderMessage(result.order), orderKeyboard(result.order, bot.adminUrl));
    }
    return bot.answer(callback.id, `Заказ ${result.order.publicNumber} ${DONE[result.order.status]}.`);
  }

  const order = await changeCustomStatusAndTell(db, bot, action.id, action.status);
  if (!order) return bot.answer(callback.id, 'Такой заявки больше нет.', true);
  if (typeof messageId === 'number') {
    void bot.edit(chatId, messageId, formatCustomOrderMessage(order), customKeyboard(order, bot.adminUrl));
  }
  return bot.answer(callback.id, `Рецепт ${order.publicNumber} ${DONE[order.status]}.`);
}

/** /orders: everything that is still waiting for the owner, each with its buttons. */
export async function sendOpenOrders(db: Db, bot: BuyerBot, chatId: number): Promise<void> {
  const open = [
    ...(await listOrders(db, { status: 'new', limit: 10, offset: 0 })),
    ...(await listOrders(db, { status: 'confirmed', limit: 10, offset: 0 })),
  ];
  const recipes = (await listCustomOrders(db)).filter((order) => order.status === 'new' || order.status === 'confirmed').slice(0, 10);

  if (open.length === 0 && recipes.length === 0) return bot.send(chatId, 'Открытых заказов нет.');

  // Oldest first, so the newest ends up at the bottom of the chat, next to the keyboard.
  for (const summary of open.reverse()) {
    const order = await getOrder(db, summary.id);
    if (order) await bot.send(chatId, formatOrderMessage(order), orderKeyboard(order, bot.adminUrl));
  }
  for (const order of recipes.reverse()) {
    await bot.send(chatId, formatCustomOrderMessage(order), customKeyboard(order, bot.adminUrl));
  }
}

/**
 * /password: a link for setting a new admin password, good for a few minutes and for one use.
 * The secret rides in the part of the address after «#», which browsers keep to themselves:
 * it reaches neither the server's log nor any other site.
 *
 * The address is written out in the message rather than hidden behind a button: Telegram opens
 * such a link at once, while a button's link makes it ask «Open Link?» first.
 */
export async function sendPasswordReset(db: Db, bot: BuyerBot, auth: AdminAuth | null, chatId: number): Promise<void> {
  if (!auth || !bot.adminUrl) return bot.send(chatId, 'Админка на сервере выключена, задать пароль отсюда нельзя.');
  const token = await startPasswordReset(db);
  return bot.send(
    chatId,
    [
      '<b>Новый пароль от админки</b>',
      `Откройте эту ссылку и придумайте пароль. Она работает ${ADMIN_PASSWORD_RESET_MINUTES} минут и только один раз:`,
      '',
      `${bot.adminUrl}/reset#${token}`,
      '',
      'Пока новый пароль не задан, действует прежний.',
    ].join('\n'),
  );
}
