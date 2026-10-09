import { createHmac } from 'node:crypto';
import type { BotButton, BuyerBot } from './services/buyer-bot';

type Log = { info: (msg: string) => void; warn: (msg: string) => void; error: (obj: unknown, msg: string) => void };

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
    /** A message with an optional link button under it. */
    async send(chatId: number | string, text: string, button?: BotButton): Promise<void> {
      await call('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {}),
      });
    },
    /** The bot's own username, or null if the token does not work. */
    async username(): Promise<string | null> {
      return (await call<{ username?: string }>('getMe', {}))?.username ?? null;
    },
    /** Tells Telegram where to deliver what people write to the bot. */
    async setWebhook(url: string, secret: string): Promise<boolean> {
      return (await call<boolean>('setWebhook', { url, secret_token: secret, allowed_updates: ['message'] })) === true;
    },
  };
}

/** Derived from the token, so it needs no setting of its own and changes when the bot does. */
export function webhookSecret(token: string): string {
  return createHmac('sha256', token).update('buyer-bot-webhook').digest('hex');
}

/**
 * Connects the bot that talks to buyers. It needs the bot's username (for the link on the
 * thank-you page) and a public https address Telegram can call; without either, buyers simply
 * get no link, and everything else works as before.
 */
export async function connectBuyerBot(token: string, publicBaseUrl: string, log: () => Log): Promise<BuyerBot | null> {
  const api = telegramApi(token, log);
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
  return { username, webhookSecret: secret, send: (chatId, text, button) => api.send(chatId, text, button) };
}
