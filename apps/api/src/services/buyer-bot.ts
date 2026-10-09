import {
  formatAmd,
  formatKg,
  type AdminCustomOrder,
  type AdminOrder,
  type OrderStatus,
  type Settings,
} from '@alyosha/shared';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { customOrders, orders } from '../db/schema';
import { getOrder } from './admin-orders';
import { getCustomOrder } from './custom-orders';

/**
 * The shop's Telegram bot, as far as buyers are concerned.
 *
 * Telegram lets a bot write only to people who pressed Start in it, so a typed @username is not
 * enough. Every order therefore gets a secret token; the thank-you page links to
 * t.me/<bot>?start=<token>, and when the buyer presses Start there, Telegram tells us their chat
 * and the token. From then on the bot can write to that chat about that order.
 */
export interface BuyerBot {
  /** The bot's username, without @. */
  username: string;
  /** What Telegram must send in X-Telegram-Bot-Api-Secret-Token with every update. */
  webhookSecret: string;
  /**
   * The chats the shop is run from (TELEGRAM_CHAT_ID: the owner's own chat, or a group of his).
   * New orders go there with action buttons, and only there do those buttons work.
   */
  adminChatIds: number[];
  /** The address of the admin panel, for the «Открыть в админке» button; null if there is none. */
  adminUrl: string | null;
  send: (chatId: number, text: string, keyboard?: Keyboard) => Promise<void>;
  /** Rewrites a message the bot sent earlier. */
  edit: (chatId: number, messageId: number, text: string, keyboard?: Keyboard) => Promise<void>;
  /** Answers a pressed button with a short notice (`alert`: as a pop-up). */
  answer: (callbackId: string, text: string, alert?: boolean) => Promise<void>;
}

/** A button under a message: a link, or an action that comes back to the shop as `data`. */
export type KeyboardButton = { text: string; url: string } | { text: string; data: string };
/** Rows of buttons. */
export type Keyboard = KeyboardButton[][];

/** Prefixes of the start parameter: which table the token belongs to. */
const ORDER = 'o';
const CUSTOM = 'r';

/** 22 characters of [A-Za-z0-9_-]: fits Telegram's 64-character start parameter. */
export function newNotifyToken(): string {
  return randomBytes(16).toString('base64url');
}

export function orderBotLink(bot: BuyerBot | null | undefined, token: string | null, kind: 'order' | 'custom'): string | null {
  if (!bot || !token) return null;
  return `https://t.me/${bot.username}?start=${kind === 'order' ? ORDER : CUSTOM}${token}`;
}

export type LinkedChat = { kind: 'order'; order: AdminOrder } | { kind: 'custom'; order: AdminCustomOrder };

/** Remembers that `chatId` wants to hear about the order behind a start parameter. */
export async function linkChat(db: Db, payload: string, chatId: number): Promise<LinkedChat | null> {
  const token = payload.slice(1);
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;

  if (payload.startsWith(ORDER)) {
    const [row] = await db
      .update(orders)
      .set({ telegramChatId: chatId })
      .where(eq(orders.notifyToken, token))
      .returning({ id: orders.id });
    const order = row ? await getOrder(db, row.id) : null;
    return order ? { kind: 'order', order } : null;
  }
  if (payload.startsWith(CUSTOM)) {
    const [row] = await db
      .update(customOrders)
      .set({ telegramChatId: chatId })
      .where(eq(customOrders.notifyToken, token))
      .returning({ id: customOrders.id });
    const order = row ? await getCustomOrder(db, row.id) : null;
    return order ? { kind: 'custom', order } : null;
  }
  return null;
}

export async function orderChatId(db: Db, id: number): Promise<number | null> {
  const [row] = await db.select({ chatId: orders.telegramChatId }).from(orders).where(eq(orders.id, id));
  return row?.chatId ?? null;
}

export async function customOrderChatId(db: Db, id: number): Promise<number | null> {
  const [row] = await db.select({ chatId: customOrders.telegramChatId }).from(customOrders).where(eq(customOrders.id, id));
  return row?.chatId ?? null;
}

// ---------- What the bot says ----------

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The button under every message: a chat with the owner himself. */
export function contactButton(settings: Pick<Settings, 'telegramContact' | 'telegramPublic'>): Keyboard | undefined {
  const username = settings.telegramContact || settings.telegramPublic;
  return username ? [[{ text: 'Написать Алёше', url: `https://t.me/${username}` }]] : undefined;
}

function orderLines(order: AdminOrder): string[] {
  return [
    ...order.items.map((item) => `• ${escapeHtml(item.name)} × ${item.qty} — ${formatAmd(item.priceAmd * item.qty)}`),
    '',
    `<b>Итого: ${formatAmd(order.totalAmd)}${order.deliveryExtra ? ' + доставка' : ''}</b>`,
  ];
}

/** Sent when the buyer presses Start from the thank-you page. */
export function orderLinkedText(order: AdminOrder): string {
  return [
    '🥟 <b>Мы получили ваш заказ</b>',
    '',
    ...orderLines(order),
    '',
    order.status === 'new' ? 'Скоро подтвердим его. Здесь будем сообщать, как он продвигается.' : orderStatusText(order),
  ].join('\n');
}

/** Sent whenever the owner moves the order to another status. */
export function orderStatusText(order: Pick<AdminOrder, 'status' | 'deliveryMethod'>): string {
  const texts: Record<OrderStatus, string> = {
    new: 'Заказ снова в обработке. Мы свяжемся с вами.',
    confirmed:
      order.deliveryMethod === 'courier'
        ? '✅ <b>Заказ подтверждён.</b>\nМы скоро напишем или позвоним вам, чтобы договориться о доставке и оплате.'
        : '✅ <b>Заказ подтверждён.</b>\nМы скоро напишем или позвоним вам, чтобы договориться, когда вы его заберёте.',
    done: '🎉 <b>Заказ выполнен.</b>\nСпасибо! Приятного аппетита.',
    cancelled: 'Заказ отменён. Если это ошибка, напишите нам.',
  };
  return texts[order.status];
}

function recipeLines(order: AdminCustomOrder): string[] {
  const list = (options: string[]) => (options.length > 0 ? options.map(escapeHtml).join(', ') : '—');
  return [
    `«${escapeHtml(order.recipeName)}» — ${formatKg(order.weightGrams)}`,
    `Основа: ${escapeHtml(order.base)}`,
    `Начинка: ${list(order.modifiers)}`,
    `Специи: ${list(order.spices)}`,
  ];
}

export function customLinkedText(order: AdminCustomOrder): string {
  return [
    '👩‍🍳 <b>Мы получили ваш рецепт</b>',
    '',
    ...recipeLines(order),
    '',
    order.status === 'new'
      ? 'Мы свяжемся с вами, чтобы подтвердить заказ и назвать цену. Здесь будем сообщать, как он продвигается.'
      : customStatusText(order),
  ].join('\n');
}

export function customStatusText(order: Pick<AdminCustomOrder, 'status' | 'recipeName'>): string {
  const name = `«${escapeHtml(order.recipeName)}»`;
  const texts: Record<OrderStatus, string> = {
    new: `Рецепт ${name} снова в обработке. Мы свяжемся с вами.`,
    confirmed: `✅ <b>Рецепт ${name} подтверждён.</b>\nМы скоро напишем или позвоним вам. Пельмени будут готовы через 2–4 дня.`,
    done: `🎉 <b>Пельмени по рецепту ${name} готовы.</b>\nСпасибо! Приятного аппетита.`,
    cancelled: `Заказ по рецепту ${name} отменён. Если это ошибка, напишите нам.`,
  };
  return texts[order.status];
}

/** For someone who opened the bot without coming from an order. */
export const WELCOME_TEXT = [
  'Здравствуйте! Это бот «Алёша Пельменыч».',
  'Он сообщает, как продвигается ваш заказ: оформите заказ на сайте и нажмите там «Получать уведомления в Telegram».',
].join('\n');

export const UNKNOWN_ORDER_TEXT = 'Не нашли такой заказ. Оформите заказ на сайте и нажмите «Получать уведомления в Telegram» ещё раз.';

/** The owner needs the number of his own chat once, to set TELEGRAM_CHAT_ID (README, "Telegram bot"). */
export function chatIdText(chatId: number): string {
  return `Номер этого чата: <code>${chatId}</code>`;
}
