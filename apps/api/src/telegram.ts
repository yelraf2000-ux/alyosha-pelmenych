import { createHmac } from 'node:crypto';
import type { BuyerBot, Keyboard } from './services/buyer-bot';

type Log = { info: (msg: string) => void; warn: (msg: string) => void; error: (obj: unknown, msg: string) => void };

/** Telegram's own shape of a keyboard: our `data` is its `callback_data`. */
function replyMarkup(keyboard: Keyboard | undefined) {
  if (!keyboard || keyboard.length === 0) return {};
  return {
    reply_markup: {
      inline_keyboard: keyboard.map((row) =>
        row.map((button) => ('url' in button ? { text: button.text, url: button.url } : { text: button.text, callback_data: button.data })),
      ),
    },
  };
}

/** The few calls of the Telegram Bot API the shop needs. Nothing here ever throws: a failure is logged. */
export function telegramApi(token: string, log: () => Log) {
  async function call<T>(method: string, body: unknown): Promise<T | null> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      const answer = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
      if (!response.ok || !answer?.ok) {
        log().error({ status: response.status, description: answer?.description }, `Telegram refused ${method}`);
        return null;
      }
      return answer.result ?? null;
    } catch (error) {
      log().error(error, `Telegram ${method} failed`);
      return null;
    }
  }

  return {
    /** A message, with buttons under it if a keyboard is given. */
    async send(chatId: number, text: string, keyboard?: Keyboard): Promise<void> {
      await call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...replyMarkup(keyboard) });
    },
    /** Rewrites a message the bot sent earlier: its text and its buttons. */
    async edit(chatId: number, messageId: number, text: string, keyboard?: Keyboard): Promise<void> {
      await call('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        // An empty keyboard takes the old buttons away.
        reply_markup: { inline_keyboard: [] },
        ...replyMarkup(keyboard),
      });
    },
    /** The short notice Telegram shows to whoever pressed a button; `alert` makes it a pop-up. */
    async answer(callbackId: string, text: string, alert = false): Promise<void> {
      await call('answerCallbackQuery', { callback_query_id: callbackId, text, show_alert: alert });
    },
    /** The bot's own username, or null if the token does not work. */
    async username(): Promise<string | null> {
      return (await call<{ username?: string }>('getMe', {}))?.username ?? null;
    },
    /** Tells Telegram where to deliver what people write to the bot and which buttons they press. */
    async setWebhook(url: string, secret: string): Promise<boolean> {
      return (
        (await call<boolean>('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'] })) === true
      );
    },
  };
}

export type TelegramApi = ReturnType<typeof telegramApi>;

/** Derived from the token, so it needs no setting of its own and changes when the bot does. */
export function webhookSecret(token: string): string {
  return createHmac('sha256', token).update('buyer-bot-webhook').digest('hex');
}

/** "123, -100456" → [123, -100456]. Anything that is not a whole number is left out. */
export function parseChatIds(value: string | undefined): number[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^-?[0-9]+$/.test(part))
    .map(Number);
}

/**
 * The admin chats named in the environment. An admin can be added in either of two ways: another
 * number in TELEGRAM_CHAT_ID after a comma, or a variable of its own whose name starts the same
 * (TELEGRAM_CHAT_ID2, TELEGRAM_CHAT_ID_ALEKSEY, …). Repeats count once.
 */
export function adminChatIdsFromEnv(env: Record<string, string | undefined> = process.env): number[] {
  const names = Object.keys(env)
    .filter((name) => name.startsWith('TELEGRAM_CHAT_ID'))
    .sort();
  return [...new Set(names.flatMap((name) => parseChatIds(env[name])))];
}

/**
 * Connects the bot for two-way use: buyers follow their orders in it, and the admin chats run
 * the shop from it. That needs the bot's username (for the link on the thank-you page) and a
 * public https address Telegram can call. Without either the function returns null: buyers get
 * no link and the owner's messages come without buttons; everything else works as before.
 */
export async function connectBot(
  api: TelegramApi,
  token: string,
  publicBaseUrl: string,
  adminChatIds: number[],
  log: () => Log,
): Promise<BuyerBot | null> {
  const username = await api.username();
  if (!username) {
    log().warn('The Telegram bot did not answer: buyers will not be offered notifications.');
    return null;
  }

  const url = new URL(publicBaseUrl);
  const reachable = url.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!reachable) {
    log().warn(`PUBLIC_BASE_URL (${publicBaseUrl}) is not a public https address: Telegram cannot call the bot here.`);
    return null;
  }

  const secret = webhookSecret(token);
  if (!(await api.setWebhook(new URL('/api/telegram/webhook', url).href, secret))) return null;
  log().info(`Telegram bot @${username} is connected: buyers can follow their orders in it.`);
  return {
    username,
    webhookSecret: secret,
    adminChatIds,
    adminUrl: new URL('/admin', url).href,
    send: api.send,
    edit: api.edit,
    answer: api.answer,
  };
}
