import type { ReactNode } from 'react';
import { t } from '../i18n';
import { formatAmd } from '../lib/format';
import type { Settings } from '../types';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const PHONE_ICON = (
  <Icon>
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
    />
  </Icon>
);

export const TELEGRAM_ICON = (
  <Icon>
    <path
      fill="currentColor"
      d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
    />
  </Icon>
);

export const INSTAGRAM_ICON = (
  <Icon>
    <rect x="2.9" y="2.9" width="18.2" height="18.2" rx="5.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="12" cy="12" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="17.4" cy="6.6" r="1.25" fill="currentColor" />
  </Icon>
);

export const TIKTOK_ICON = (
  <Icon>
    <path
      fill="currentColor"
      d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
    />
  </Icon>
);

/** A round button with the logo of each network the shop is on (the footer). */
export function SocialLinks({ settings }: { settings: Settings }) {
  const networks = [
    {
      name: t.contacts.telegram,
      href: settings.telegramPublic && `https://t.me/${settings.telegramPublic}`,
      icon: TELEGRAM_ICON,
    },
    { name: t.contacts.instagram, href: settings.instagramUrl, icon: INSTAGRAM_ICON },
    { name: t.contacts.tiktok, href: settings.tiktokUrl, icon: TIKTOK_ICON },
  ].filter((network) => network.href);
  if (networks.length === 0) return null;

  return (
    <ul className="socials">
      {networks.map((network) => (
        <li key={network.name}>
          <a className="social" href={network.href} target="_blank" rel="noreferrer" aria-label={network.name} title={network.name}>
            {network.icon}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Алексей's portrait, shown beside the «О нас» text (the file is in public/about). */
export function AboutPhoto() {
  return (
    <img
      className="about__photo"
      src="/about/aleksey-800.webp"
      srcSet="/about/aleksey-400.webp 400w, /about/aleksey-800.webp 800w"
      sizes="(min-width: 640px) 320px, 300px"
      width={800}
      height={1067}
      alt={t.about.photoAlt}
      loading="lazy"
      decoding="async"
    />
  );
}

/** Both ways to get an order, in one card: pickup and courier. */
export function DeliveryInfo({ settings }: { settings: Settings }) {
  return (
    <div className="info-card delivery">
      <div className="delivery__way">
        <span className="info-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.500C5 14.9 12 21 12 21Z" />
            <circle cx="12" cy="9.500" r="2.500" />
          </svg>
        </span>
        <div>
          <h3>{t.delivery.pickupTitle}</h3>
          <p>{settings.pickupAddress}</p>
        </div>
      </div>
      <div className="delivery__way">
        <span className="info-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
            <circle cx="7" cy="17.500" r="1.800" />
            <circle cx="17.500" cy="17.500" r="1.800" />
          </svg>
        </span>
        <div>
          <h3>{t.delivery.courierTitle}</h3>
          <p>
            {t.delivery.courierFreeFrom(formatAmd(settings.freeDeliveryFromAmd))}
            {settings.courierFeeAmd === 0 && ` ${t.delivery.courierExtraBelow}`}
          </p>
          {settings.deliveryNote && <p className="muted">{settings.deliveryNote}</p>}
        </div>
      </div>
    </div>
  );
}
