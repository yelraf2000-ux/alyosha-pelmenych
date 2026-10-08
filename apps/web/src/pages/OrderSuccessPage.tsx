import type { CSSProperties } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Dumpling } from '../components/Dumpling';
import { t } from '../i18n';
import { formatAmd } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import type { OrderView } from '../types';

const LAST_ORDER_KEY = 'ap_last_order_v1';

/** Kept for the tab's lifetime so the confirmation survives a page refresh. */
export function saveLastOrder(order: OrderView): void {
  try {
    sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
  } catch {
    // the order is also passed through router state
  }
}

function loadLastOrder(): OrderView | null {
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY);
    return raw ? (JSON.parse(raw) as OrderView) : null;
  } catch {
    return null;
  }
}

export default function OrderSuccessPage() {
  useTitle(t.success.title);
  const { number } = useParams();
  const location = useLocation();
  const fromState = (location.state as { order?: OrderView } | null)?.order;
  const candidate = fromState ?? loadLastOrder();
  const order = candidate && candidate.publicNumber === number ? candidate : null;

  return (
    <div className="section container narrow success">
      <div className="success__mark" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="success__bit" style={{ '--a': `${i * 45}deg` } as CSSProperties}>
            <Dumpling />
          </span>
        ))}
        <span>✓</span>
      </div>
      <h1>{t.success.title}</h1>
      <p className="lead">{t.success.text}</p>

      {order && (
        <div className="panel success__order">
          <p className="success__number">
            {t.success.number}: <strong>{order.publicNumber}</strong>
          </p>
          <ul className="summary__items">
            {order.items.map((item) => (
              <li key={item.productId}>
                <span>
                  {item.name} × {item.qty}
                </span>
                <span>{formatAmd(item.priceAmd * item.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="totals">
            <div>
              <dt>{order.deliveryMethod === 'pickup' ? t.cart.pickup : t.checkout.courier}</dt>
              <dd>{order.deliveryFeeAmd === 0 ? t.cart.free : formatAmd(order.deliveryFeeAmd)}</dd>
            </div>
            {order.deliveryAddress && (
              <div>
                <dt>{t.checkout.address}</dt>
                <dd>{order.deliveryAddress}</dd>
              </div>
            )}
            <div className="totals__total">
              <dt>{t.cart.total}</dt>
              <dd>{formatAmd(order.totalAmd)}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="success__links">
        <Link to="/" className="btn btn--primary">
          {t.success.toHome}
        </Link>
        <Link to="/catalog" className="btn">
          {t.success.toCatalog}
        </Link>
      </div>
    </div>
  );
}
