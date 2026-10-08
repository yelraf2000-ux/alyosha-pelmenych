import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { IS_DEMO, resetDemo } from '../api';
import { SITE_CREDIT } from '../config';
import { t } from '../i18n';
import { formatAmd, telHref } from '../lib/format';
import { useCart } from '../state/CartContext';
import { useShop } from '../state/ShopContext';
import { Logo } from './Logo';

const NAV = [
  { to: '/catalog', label: t.nav.catalog },
  { to: '/about', label: t.nav.about },
  { to: '/delivery', label: t.nav.delivery },
  { to: '/contacts', label: t.nav.contacts },
];

function DemoBanner() {
  const { refresh } = useShop();
  const cart = useCart();
  return (
    <div className="demo">
      <span>{t.demo.text}</span>
      <button
        type="button"
        className="demo__reset"
        onClick={() => {
          resetDemo();
          cart.clear();
          void refresh();
        }}
      >
        {t.demo.reset}
      </button>
    </div>
  );
}

function Header() {
  const cart = useCart();
  return (
    <header className="header">
      <div className="container header__inner">
        <Link to="/" className="header__logo" aria-label={`${t.brand} — ${t.nav.home}`}>
          <Logo />
        </Link>
        <nav className="nav" aria-label={t.nav.main}>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav__link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Link to="/cart" className="cart-link">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path
              d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20.5 7H6.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" />
            <circle cx="17.5" cy="19.5" r="1.4" fill="currentColor" />
          </svg>
          <span>{t.nav.cart}</span>
          {/* key: remount on every change so the bump animation replays */}
          {cart.count > 0 && (
            <span key={cart.count} className="cart-link__count">
              {cart.count}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}

function Footer() {
  const { settings } = useShop();
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div>
          <Logo />
          {settings && (
            <p className="footer__contacts">
              {settings.phonePublic && <a href={telHref(settings.phonePublic)}>{settings.phonePublic}</a>}
              {settings.telegramPublic && (
                <a href={`https://t.me/${settings.telegramPublic}`} target="_blank" rel="noreferrer">
                  Telegram
                </a>
              )}
              {settings.instagramUrl && (
                <a href={settings.instagramUrl} target="_blank" rel="noreferrer">
                  Instagram
                </a>
              )}
              {settings.tiktokUrl && (
                <a href={settings.tiktokUrl} target="_blank" rel="noreferrer">
                  TikTok
                </a>
              )}
            </p>
          )}
        </div>
        <nav className="footer__nav" aria-label={t.nav.main}>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="footer__credit">
          {t.footer.madeBy}{' '}
          {SITE_CREDIT.url ? (
            <a href={SITE_CREDIT.url} target="_blank" rel="noreferrer">
              {SITE_CREDIT.name}
            </a>
          ) : (
            SITE_CREDIT.name
          )}
        </p>
      </div>
    </footer>
  );
}

/** Mobile only: a bar pinned to the bottom of the screen once the cart has something in it. */
function StickyCart() {
  const cart = useCart();
  const { pathname } = useLocation();
  const hidden = cart.count === 0 || /^\/(cart|checkout|order)/.test(pathname);
  if (hidden) return null;
  return (
    <div className="sticky-cart">
      <Link to="/cart" className="btn btn--primary btn--block btn--lg">
        <span key={cart.count} className="sticky-cart__label">
          {t.cart.sticky} · {cart.count}
        </span>
        <span>{formatAmd(cart.subtotal)}</span>
      </Link>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function Layout() {
  const { loading, error, settings } = useShop();
  const { pathname } = useLocation();

  return (
    <div className="page">
      <ScrollToTop />
      {IS_DEMO && <DemoBanner />}
      <Header />
      <main className={loading ? 'main main--loading' : 'main'}>
        {loading ? (
          <p className="container state">{t.loading}</p>
        ) : error || !settings ? (
          <p className="container state" role="alert">
            {t.loadError}
          </p>
        ) : (
          <div key={pathname} className="route">
            <Outlet />
          </div>
        )}
      </main>
      <Footer />
      <StickyCart />
    </div>
  );
}
