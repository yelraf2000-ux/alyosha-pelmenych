import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { telHref } from '../lib/format';
import type { Settings } from '../types';
import { PHONE_ICON, TELEGRAM_ICON } from './InfoBlocks';

/** `https://www.instagram.com/name/` → `@name`; anything unexpected falls back to the network's name. */
function instagramHandle(url: string): string {
  try {
    const name = new URL(url).pathname.split('/').filter(Boolean)[0];
    return name ? `@${name}` : t.contacts.instagram;
  } catch {
    return t.contacts.instagram;
  }
}

/** The Instagram glyph in the network's own gradient (the plain one for the footer is in InfoBlocks). */
function InstagramColorIcon() {
  const gradient = useId();
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#feda75" />
          <stop offset=".3" stopColor="#fa7e1e" />
          <stop offset=".55" stopColor="#d62976" />
          <stop offset=".8" stopColor="#962fbf" />
          <stop offset="1" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <rect x="2.9" y="2.9" width="18.2" height="18.2" rx="5.2" fill="none" stroke={`url(#${gradient})`} strokeWidth="1.9" />
      <circle cx="12" cy="12" r="4.3" fill="none" stroke={`url(#${gradient})`} strokeWidth="1.9" />
      <circle cx="17.4" cy="6.6" r="1.25" fill={`url(#${gradient})`} />
    </svg>
  );
}

/**
 * The contacts in the header's top right corner: a round button with a handset, and under it a
 * panel that rolls down with the phone number, Telegram and Instagram, each icon in its own
 * colour. A mouse opens it by hovering (that part is CSS, see `.contact-menu`); a tap or the
 * keyboard opens it with the button, and a tap elsewhere or Escape closes it.
 */
export function ContactMenu({ settings }: { settings: Settings }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items: { kind: string; label: string; text: string; href: string; icon: ReactNode; external: boolean }[] = [];
  if (settings.phonePublic) {
    items.push({
      kind: 'phone',
      label: t.contacts.phone,
      text: settings.phonePublic,
      href: telHref(settings.phonePublic),
      icon: PHONE_ICON,
      external: false,
    });
  }
  if (settings.telegramPublic) {
    items.push({
      kind: 'telegram',
      label: t.contacts.telegram,
      text: `@${settings.telegramPublic}`,
      href: `https://t.me/${settings.telegramPublic}`,
      icon: TELEGRAM_ICON,
      external: true,
    });
  }
  if (settings.instagramUrl) {
    items.push({
      kind: 'instagram',
      label: t.contacts.instagram,
      text: instagramHandle(settings.instagramUrl),
      href: settings.instagramUrl,
      icon: <InstagramColorIcon />,
      external: true,
    });
  }
  if (items.length === 0) return null;

  return (
    <div ref={root} className={open ? 'contact-menu contact-menu--open' : 'contact-menu'}>
      <button
        type="button"
        className="contact-menu__toggle"
        aria-label={t.contacts.menu}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {PHONE_ICON}
      </button>

      <div className="contact-menu__drop" id={panelId}>
        <ul className="contact-menu__panel">
          {items.map((item) => (
            <li key={item.kind}>
              <a
                className={`contact-menu__item contact-menu__item--${item.kind}`}
                href={item.href}
                aria-label={`${item.label}: ${item.text}`}
                onClick={() => setOpen(false)}
                {...(item.external ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                {item.icon}
                <strong>{item.text}</strong>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
