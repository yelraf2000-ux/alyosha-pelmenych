import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { useCart } from '../state/CartContext';
import type { Product } from '../types';
import { NotifyModal } from './NotifyModal';
import { QtyStepper } from './QtyStepper';

const LOW_STOCK = 3;

/** Stock note, quantity stepper and the buy button; or the out-of-stock state with "notify me". */
export function PurchaseControls({ product }: { product: Product }) {
  const cart = useCart();
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), 1400);
    return () => clearTimeout(timer);
  }, [justAdded]);

  if (product.stockQty <= 0) {
    return (
      <div className="buy">
        <button type="button" className="btn btn--block" disabled>
          {t.product.awaiting}
        </button>
        <button type="button" className="link-btn" onClick={() => setNotifyOpen(true)}>
          {t.product.notify}
        </button>
        {notifyOpen && <NotifyModal product={product} onClose={() => setNotifyOpen(false)} />}
      </div>
    );
  }

  const inCart = cart.qtyOf(product.id);
  const available = product.stockQty - inCart;
  const shownQty = Math.max(1, Math.min(qty, available));

  return (
    <div className="buy">
      <p className="buy__notes">
        {product.stockQty <= LOW_STOCK && <span className="buy__low">{t.product.left(product.stockQty)}</span>}
        {inCart > 0 && <span className="buy__incart">{t.product.inCart(inCart)}</span>}
      </p>
      <div className="buy__row">
        <QtyStepper value={shownQty} max={Math.max(1, available)} disabled={available <= 0} onChange={setQty} />
        <button
          type="button"
          className="btn btn--primary buy__add"
          disabled={available <= 0}
          onClick={() => {
            cart.add(product.id, shownQty);
            setQty(1);
            setJustAdded(true);
          }}
        >
          {available <= 0 ? t.product.allInCart : justAdded ? `${t.product.added} ✓` : t.product.addToCart}
        </button>
      </div>
    </div>
  );
}
