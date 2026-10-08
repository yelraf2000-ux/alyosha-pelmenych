import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductPhoto } from '../components/ProductPhoto';
import { QtyStepper } from '../components/QtyStepper';
import { t } from '../i18n';
import { formatAmd } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useCart } from '../state/CartContext';
import { useShop } from '../state/ShopContext';

export default function CartPage() {
  useTitle(t.cart.title);
  const cart = useCart();
  const { settings } = useShop();
  const list = useRef<HTMLUListElement>(null);
  // Products on their way out of the cart: struck through and folding away (`.line--leaving`).
  const [leaving, setLeaving] = useState<ReadonlySet<number>>(new Set());
  if (!settings) return null;

  const remove = (productId: number) => {
    setLeaving((prev) => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
    cart.remove(productId);
  };

  /** A line strikes the row through, the row folds away, and only then the product leaves the cart. */
  const takeOut = (productId: number) => {
    const row = list.current?.querySelector<HTMLElement>(`[data-line="${productId}"]`);
    if (!row || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      remove(productId);
      return;
    }
    row.style.setProperty('--line-height', `${row.offsetHeight}px`);
    setLeaving((prev) => new Set(prev).add(productId));
    // The way out if the browser never reports the end of the animation (a tab in the background).
    window.setTimeout(() => remove(productId), 1200);
  };

  if (cart.lines.length === 0) {
    return (
      <div className="section container narrow state">
        <h1>{t.cart.emptyTitle}</h1>
        {cart.notice && <p className="alert">{cart.notice}</p>}
        <p>{t.cart.emptyText}</p>
        <Link to="/catalog" className="btn btn--primary">
          {t.product.toCatalog}
        </Link>
      </div>
    );
  }

  const untilFree = settings.freeDeliveryFromAmd - cart.subtotal;

  return (
    <div className="section container">
      <h1>{t.cart.title}</h1>

      {cart.notice && (
        <p className="alert" role="status">
          {cart.notice}{' '}
          <button type="button" className="link-btn" onClick={cart.dismissNotice}>
            {t.close}
          </button>
        </p>
      )}

      <div className="split">
        <ul className="lines" ref={list}>
          {cart.lines.map(({ product, qty, lineTotal }) => (
            <li
              key={product.id}
              data-line={product.id}
              className={leaving.has(product.id) ? 'line line--leaving' : 'line'}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget && event.animationName === 'line-fold') remove(product.id);
              }}
            >
              <Link to={`/product/${product.slug}`} className="line__media" tabIndex={-1} aria-hidden="true">
                <ProductPhoto product={product} />
              </Link>
              <div className="line__info">
                <Link to={`/product/${product.slug}`} className="line__name">
                  {product.name}
                </Link>
                <span className="muted">
                  {product.weightLabel} · {formatAmd(product.priceAmd)}
                </span>
                {qty >= product.stockQty && <span className="buy__low">{t.cart.maxReached(product.stockQty)}</span>}
              </div>
              <div className="line__controls">
                {/* No separate «remove» button: minus at 1 takes the product out of the cart. */}
                <QtyStepper
                  value={qty}
                  min={0}
                  max={product.stockQty}
                  decreaseLabel={qty === 1 ? t.cart.removeItem(product.name) : undefined}
                  onChange={(next) => (next < 1 ? takeOut(product.id) : cart.setQty(product.id, next))}
                />
                <strong className="line__total">{formatAmd(lineTotal)}</strong>
              </div>
            </li>
          ))}
        </ul>

        <aside className="summary">
          <dl className="totals">
            <div>
              <dt>{t.cart.subtotal}</dt>
              <dd>{formatAmd(cart.subtotal)}</dd>
            </div>
          </dl>
          {/* Below the threshold: how much is missing. At or above it: the good news, for as long as it holds. */}
          {untilFree > 0 ? (
            <p className="muted small">{t.cart.untilFree(formatAmd(untilFree))}.</p>
          ) : (
            <p className="summary__free" role="status">
              {t.cart.deliveryIsFree}
            </p>
          )}
          <Link to="/checkout" className="btn btn--primary btn--block btn--lg">
            {t.cart.checkout}
          </Link>
        </aside>
      </div>
    </div>
  );
}
