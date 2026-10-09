import type { CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Dumpling } from '../components/Dumpling';
import { TelegramFollow } from '../components/TelegramFollow';
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
  const location = useLocation();
  const fromState = (location.state as { order?: OrderView } | null)?.order;
  // The address does not name the order (the buyer is not shown its number): it is the one just
  // placed in this tab.
  const order = fromState ?? loadLastOrder();

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
      <TelegramFollow link={order?.telegramLink} />

      {order && (
        <div className="panel success__order">
          {/* The order's number is for the shop (the admin and the owner's message); the buyer is not shown it. */}
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
              <dd>
                {order.deliveryExtra
                  ? t.cart.deliveryExtra
                  : order.deliveryFeeAmd === 0
                    ? t.cart.free
                    : formatAmd(order.deliveryFeeAmd)}
              </dd>
            </div>
            {order.deliveryAddress && (
              <div>
                <dt>{t.checkout.address}</dt>
                <dd>{order.deliveryAddress}</dd>
              </div>
            )}
            <div className="totals__total">
              <dt>{t.cart.total}</dt>
              <dd>{order.deliveryExtra ? t.cart.plusDelivery(formatAmd(order.totalAmd)) : formatAmd(order.totalAmd)}</dd>
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
