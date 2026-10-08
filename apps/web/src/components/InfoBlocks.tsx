import { t } from '../i18n';
import { formatAmd, telHref } from '../lib/format';
import type { Settings } from '../types';

export function ContactsList({ settings }: { settings: Settings }) {
  return (
    <ul className="contacts">
      {settings.phonePublic && (
        <li>
          <a className="contact" href={telHref(settings.phonePublic)}>
            <span className="contact__label">{t.contacts.phone}</span>
            <span className="contact__value">{settings.phonePublic}</span>
            <span className="contact__action">{t.contacts.call} →</span>
          </a>
        </li>
      )}
      {settings.telegramPublic && (
        <li>
          <a className="contact" href={`https://t.me/${settings.telegramPublic}`} target="_blank" rel="noreferrer">
            <span className="contact__label">{t.contacts.telegram}</span>
            <span className="contact__value">@{settings.telegramPublic}</span>
            <span className="contact__action">{t.contacts.write} →</span>
          </a>
        </li>
      )}
      {settings.instagramUrl && (
        <li>
          <a className="contact" href={settings.instagramUrl} target="_blank" rel="noreferrer">
            <span className="contact__label">{t.contacts.instagram}</span>
            <span className="contact__value">Instagram</span>
            <span className="contact__action">{t.contacts.openInstagram} →</span>
          </a>
        </li>
      )}
    </ul>
  );
}

export function DeliveryCards({ settings }: { settings: Settings }) {
  return (
    <div className="info-cards">
      <div className="info-card">
        <span className="info-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.500C5 14.9 12 21 12 21Z" />
            <circle cx="12" cy="9.500" r="2.500" />
          </svg>
        </span>
        <h3>{t.delivery.pickupTitle}</h3>
        <p>{settings.pickupAddress}</p>
      </div>
      <div className="info-card">
        <span className="info-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
            <circle cx="7" cy="17.500" r="1.800" />
            <circle cx="17.500" cy="17.500" r="1.800" />
          </svg>
        </span>
        <h3>{t.delivery.courierTitle}</h3>
        <p>
          {t.delivery.courierFee(formatAmd(settings.courierFeeAmd))}{' '}
          {t.delivery.courierFreeFrom(formatAmd(settings.freeDeliveryFromAmd))}
        </p>
        {settings.deliveryNote && <p className="muted">{settings.deliveryNote}</p>}
      </div>
    </div>
  );
}
