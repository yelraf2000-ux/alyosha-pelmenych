import { formatAmd, type OrderView } from '@alyosha/shared';
import type { OrderCustomer } from './services/orders';

/** Messages to the shop owner (SPEC §6: every new order and every "notify me" request). */
export interface Notifier {
  orderPlaced(order: OrderView, customer: OrderCustomer): Promise<void>;
  stockRequested(request: { productName: string; name: string; phone: string; telegram: string | null }): Promise<void>;
}

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

export function formatOrderMessage(order: OrderView, customer: OrderCustomer): string {
  const lines = [
    `🥟 <b>Новый заказ ${escapeHtml(order.publicNumber)}</b>`,
    '',
    ...order.items.map(
      (item) => `• ${escapeHtml(item.name)} × ${item.qty} — ${formatAmd(item.priceAmd * item.qty)}`,
    ),
    '',
    `Товары: ${formatAmd(order.itemsTotalAmd)}`,
    order.deliveryMethod === 'pickup'
      ? 'Самовывоз'
      : `Курьер: ${order.deliveryFeeAmd === 0 ? 'бесплатно' : formatAmd(order.deliveryFeeAmd)}`,
    `<b>Итого: ${formatAmd(order.totalAmd)}</b>`,
    '',
  ];
  if (order.deliveryAddress) lines.push(`📍 ${escapeHtml(order.deliveryAddress)}`);
  lines.push(...contactLines(customer));
  if (customer.comment) lines.push(`💬 ${escapeHtml(customer.comment)}`);
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

type Log = { info: (msg: string) => void; error: (obj: unknown, msg: string) => void };

/** Sends through the Telegram Bot API. A failed send is logged and never fails the order. */
export function telegramNotifier(token: string, chatId: string, log: Log): Notifier {
  async function send(text: string): Promise<void> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        log.error({ status: response.status, body: await response.text() }, 'Telegram refused the message');
      }
    } catch (error) {
      log.error(error, 'Telegram message was not sent');
    }
  }
  return {
    orderPlaced: (order, customer) => send(formatOrderMessage(order, customer)),
    stockRequested: (request) => send(formatStockRequestMessage(request)),
  };
}

/** Used while TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set: prints the message to the log. */
export function consoleNotifier(log: Log): Notifier {
  const print = async (text: string) => log.info(`[Telegram is not configured] message would be:\n${text}`);
  return {
    orderPlaced: (order, customer) => print(formatOrderMessage(order, customer)),
    stockRequested: (request) => print(formatStockRequestMessage(request)),
  };
}
