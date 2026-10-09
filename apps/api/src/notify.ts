import { formatAmd, formatKg, type AdminCustomOrder, type AdminOrder, type OrderStatus } from '@alyosha/shared';
import type { Keyboard } from './services/buyer-bot';

/** Messages to the shop owner (SPEC §6: every new order and every "notify me" request). */
export interface Notifier {
  orderPlaced(order: AdminOrder): Promise<void>;
  stockRequested(request: { productName: string; name: string; phone: string; telegram: string | null }): Promise<void>;
  customOrderPlaced(order: AdminCustomOrder): Promise<void>;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: '🆕 Новый',
  confirmed: '✅ Подтверждён',
  done: '🎉 Выполнен',
  cancelled: '❌ Отменён',
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function contactLines(contact: { name: string; phone: string; telegram: string | null }): string[] {
  const lines = [`👤 ${escapeHtml(contact.name)}`, `📞 ${escapeHtml(contact.phone)}`];
  if (contact.telegram) {
    // Usernames are validated to [a-zA-Z0-9_], so they are safe inside the link.
    lines.push(`✈️ <a href="https://t.me/${contact.telegram}">@${contact.telegram}</a>`);
  }
  return lines;
}

/**
 * An order as the owner reads it in Telegram. The same text is sent when the order comes in and
 * written back into that message whenever its status changes, so it always ends with the status.
 */
export function formatOrderMessage(order: AdminOrder): string {
  const lines = [
    `🥟 <b>${order.status === 'new' ? 'Новый заказ' : 'Заказ'} ${escapeHtml(order.publicNumber)}</b>`,
    '',
    ...order.items.map((item) => `• ${escapeHtml(item.name)} × ${item.qty} — ${formatAmd(item.priceAmd * item.qty)}`),
    '',
    `Товары: ${formatAmd(order.itemsTotalAmd)}`,
    order.deliveryMethod === 'pickup'
      ? 'Самовывоз'
      : order.deliveryExtra
        ? 'Курьер: доставка оплачивается отдельно'
        : `Курьер: ${order.deliveryFeeAmd === 0 ? 'бесплатно' : formatAmd(order.deliveryFeeAmd)}`,
    `<b>Итого: ${formatAmd(order.totalAmd)}${order.deliveryExtra ? ' + доставка' : ''}</b>`,
    '',
  ];
  if (order.deliveryAddress) lines.push(`📍 ${escapeHtml(order.deliveryAddress)}`);
  lines.push(...contactLines({ name: order.customerName, phone: order.customerPhone, telegram: order.customerTelegram }));
  if (order.comment) lines.push(`💬 ${escapeHtml(order.comment)}`);
  lines.push('', `Статус: <b>${STATUS_LABELS[order.status]}</b>`);
  if (order.telegramLinked) lines.push('Покупатель подключил бота: о смене статуса он узнает сам.');
  return lines.join('\n');
}

export function formatStockRequestMessage(request: Parameters<Notifier['stockRequested']>[0]): string {
  return [
    '🔔 <b>Сообщить о поступлении</b>',
    `Товар: ${escapeHtml(request.productName)}`,
    '',
    ...contactLines(request),
  ].join('\n');
}

export function formatCustomOrderMessage(order: AdminCustomOrder): string {
  const list = (options: string[]) => (options.length > 0 ? options.map(escapeHtml).join(', ') : '—');
  const lines = [
    `👩‍🍳 <b>Свой рецепт ${escapeHtml(order.publicNumber)}</b>`,
    `«${escapeHtml(order.recipeName)}» — ${formatKg(order.weightGrams)}`,
    '',
    `Основа: ${escapeHtml(order.base)}`,
    `Добавки: ${list(order.modifiers)}`,
    `Специи: ${list(order.spices)}`,
    '',
    ...contactLines({ name: order.customerName, phone: order.customerPhone, telegram: order.customerTelegram }),
  ];
  if (order.comment) lines.push(`💬 ${escapeHtml(order.comment)}`);
  lines.push('', `Статус: <b>${STATUS_LABELS[order.status]}</b>`);
  if (order.status === 'new') lines.push('Цены нет: назовите её покупателю при подтверждении.');
  if (order.telegramLinked) lines.push('Покупатель подключил бота: о смене статуса он узнает сам.');
  return lines.join('\n');
}

// ---------- The buttons under an order in the owner's chat ----------

/** One letter per status in a button's data, which Telegram limits to 64 bytes. */
const STATUS_CODES: Record<OrderStatus, string> = { new: 'n', confirmed: 'c', done: 'd', cancelled: 'x' };

/** Reads a pressed button back: «o:12:c» → order 12 to "confirmed"; «r:…» is a «Свой рецепт» request. */
export function parseAction(data: unknown): { kind: 'order' | 'custom'; id: number; status: OrderStatus } | null {
  const match = typeof data === 'string' ? /^([or]):(\d{1,9}):([ncdx])$/.exec(data) : null;
  if (!match) return null;
  const status = (Object.keys(STATUS_CODES) as OrderStatus[]).find((key) => STATUS_CODES[key] === match[3])!;
  return { kind: match[1] === 'o' ? 'order' : 'custom', id: Number(match[2]), status };
}

/** What can be done next with an order in this status, and a way into the admin panel. */
function actionKeyboard(prefix: 'o' | 'r', id: number, status: OrderStatus, adminLink: string | null): Keyboard {
  const action = (text: string, next: OrderStatus) => ({ text, data: `${prefix}:${id}:${STATUS_CODES[next]}` });
  const rows: Keyboard = [];
  if (status === 'new') rows.push([action('✅ Подтвердить', 'confirmed'), action('❌ Отменить', 'cancelled')]);
  if (status === 'confirmed') rows.push([action('🎉 Выполнен', 'done'), action('❌ Отменить', 'cancelled')]);
  if (status === 'cancelled') rows.push([action('↩️ Вернуть в новые', 'new')]);
  if (adminLink) rows.push([{ text: 'Открыть в админке', url: adminLink }]);
  return rows;
}

export function orderKeyboard(order: Pick<AdminOrder, 'id' | 'status'>, adminUrl: string | null): Keyboard {
  return actionKeyboard('o', order.id, order.status, adminUrl && `${adminUrl}/orders/${order.id}`);
}

export function customKeyboard(order: Pick<AdminCustomOrder, 'id' | 'status'>, adminUrl: string | null): Keyboard {
  return actionKeyboard('r', order.id, order.status, adminUrl && `${adminUrl}/recipes`);
}

// ---------- Notifiers ----------

type Log = { info: (msg: string) => void };

/**
 * Sends to every admin chat (the owner's own, or a group of his). With `buttons` the orders come
 * with their action buttons; that needs the bot's webhook, so without it they are plain messages.
 */
export function telegramNotifier(
  send: (chatId: number, text: string, keyboard?: Keyboard) => Promise<void>,
  chatIds: number[],
  options: { buttons: boolean; adminUrl: string | null },
): Notifier {
  const toAll = async (text: string, keyboard?: Keyboard) => {
    await Promise.all(chatIds.map((chatId) => send(chatId, text, options.buttons ? keyboard : undefined)));
  };
  return {
    orderPlaced: (order) => toAll(formatOrderMessage(order), orderKeyboard(order, options.adminUrl)),
    stockRequested: (request) => toAll(formatStockRequestMessage(request)),
    customOrderPlaced: (order) => toAll(formatCustomOrderMessage(order), customKeyboard(order, options.adminUrl)),
  };
}

/** Used while TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set: prints the message to the log. */
export function consoleNotifier(log: Log): Notifier {
  const print = async (text: string) => log.info(`[Telegram is not configured] message would be:\n${text}`);
  return {
    orderPlaced: (order) => print(formatOrderMessage(order)),
    stockRequested: (request) => print(formatStockRequestMessage(request)),
    customOrderPlaced: (order) => print(formatCustomOrderMessage(order)),
  };
}
