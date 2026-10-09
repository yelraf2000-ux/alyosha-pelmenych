import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { IS_DEMO, resetDemo } from '../api';
import { t } from '../i18n';
import { formatAmd, paragraphs } from '../lib/format';
import { useCart } from '../state/CartContext';
import { useShop } from '../state/ShopContext';
import { ContactMenu } from './ContactMenu';
import { SocialLinks } from './InfoBlocks';
import { Intro, shouldPlayIntro } from './Intro';
import { LogoBadge } from './Logo';

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

/** True once the page has moved by more than `after` pixels: the sticky header then needs a surface of its own. */
function useScrolled(after: number): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > after);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [after]);
  return scrolled;
}

/** `logoWaiting`: the entry animation is still carrying the logo to its place here. */
function Header({ logoRef, logoWaiting }: { logoRef: RefObject<HTMLAnchorElement>; logoWaiting: boolean }) {
  const cart = useCart();
  const { settings } = useShop();
  const { pathname } = useLocation();
  const home = pathname === '/';
  // On the home page, while it is at the very top, the logo stands big in the middle above the
  // title; the first scroll sends it to its corner (see `.header--home` in the styles).
  const scrolled = useScrolled(home ? 16 : 4);
  const hours = settings ? paragraphs(settings.contactsText)[0] : undefined;
  const className = ['header', home && 'header--home', scrolled && 'header--scrolled']
    .filter(Boolean)
    .join(' ');
  return (
    <header className={className}>
      <div className="container header__inner">
        <Link
          ref={logoRef}
          to="/"
          className={logoWaiting ? 'header__logo header__logo--waiting' : 'header__logo'}
          aria-label={`${t.brand} — ${t.nav.home}`}
        >
          <LogoBadge className="logo__mark" openName />
        </Link>
        {/* The working hours (the first paragraph of the «Контакты» text in the settings). */}
        {hours && <p className="header__hours">{hours}</p>}
        <div className="header__actions">
          {settings && <ContactMenu settings={settings} />}
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
      </div>
    </header>
  );
}

function Footer() {
  const { settings } = useShop();
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <p className="footer__brand">© {t.brand}</p>
        {settings && <SocialLinks settings={settings} />}
      </div>
    </footer>
  );
}

/** Mobile only: a bar pinned to the bottom of the screen once the cart has something in it. */
function StickyCart() {
  const cart = useCart();
  const { pathname } = useLocation();
  const hidden = cart.count === 0 || /^\/(cart|checkout|order|custom)/.test(pathname);
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
  const logoRef = useRef<HTMLAnchorElement>(null);
  const [intro, setIntro] = useState(shouldPlayIntro);
  const endIntro = useCallback(() => setIntro(false), []);

  return (
    <div className="page">
      <ScrollToTop />
      {intro && <Intro target={logoRef} onDone={endIntro} />}
      {IS_DEMO && <DemoBanner />}
      <Header logoRef={logoRef} logoWaiting={intro} />
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
