import { t } from '../i18n';
import { TELEGRAM_ICON } from './InfoBlocks';

/**
 * The way to hear about an order in Telegram: opens the shop's bot with this order's key.
 * Telegram lets a bot write only to people who pressed Start in it, hence the extra tap.
 * `link` is null while the shop has no bot connected; then nothing is shown.
 */
export function TelegramFollow({ link }: { link: string | null | undefined }) {
  if (!link) return null;
  return (
    <div className="tg-follow">
      <a className="btn btn--lg tg-follow__btn" href={link} target="_blank" rel="noreferrer">
        {TELEGRAM_ICON}
        {t.telegram.follow}
      </a>
      <p className="muted small">{t.telegram.followHint}</p>
    </div>
  );
}
