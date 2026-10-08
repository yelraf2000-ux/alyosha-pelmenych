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
  if (!settings) return null;

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
        <ul className="lines">
          {cart.lines.map(({ product, qty, lineTotal }) => (
            <li key={product.id} className="line">
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
                <QtyStepper value={qty} max={product.stockQty} onChange={(next) => cart.setQty(product.id, next)} />
                <strong className="line__total">{formatAmd(lineTotal)}</strong>
                <button
                  type="button"
                  className="link-btn"
                  aria-label={t.cart.removeItem(product.name)}
                  onClick={() => cart.remove(product.id)}
                >
                  {t.cart.remove}
                </button>
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
            <div>
              <dt>{t.cart.pickup}</dt>
              <dd>{t.cart.free}</dd>
            </div>
            <div>
              <dt>{t.cart.courier}</dt>
              <dd>{untilFree <= 0 ? t.cart.free : formatAmd(settings.courierFeeAmd)}</dd>
            </div>
          </dl>
          <p className="muted small">
            {untilFree > 0 ? t.cart.untilFree(formatAmd(untilFree)) : t.cart.freeFrom(formatAmd(settings.freeDeliveryFromAmd))}
            . {t.cart.deliveryPreview}
          </p>
          <Link to="/checkout" className="btn btn--primary btn--block btn--lg">
            {t.cart.checkout}
          </Link>
          <Link to="/catalog" className="more-link summary__back">
            {t.cart.continue}
          </Link>
        </aside>
      </div>
    </div>
  );
}
