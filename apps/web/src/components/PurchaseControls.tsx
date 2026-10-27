import { orderableQty } from '@alyosha/shared';
import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { useCart } from '../state/CartContext';
import { useShop } from '../state/ShopContext';
import type { Product } from '../types';
import { QtyStepper } from './QtyStepper';

const LOW_STOCK = 3;

/**
 * Stock note, quantity stepper and the buy button. A product that has run out can still be bought
 * as a pre-order when the shop allows it; otherwise it shows «Ожидается поставка».
 */
export function PurchaseControls({ product }: { product: Product }) {
  const cart = useCart();
  const { settings } = useShop();
  const preorder = Boolean(settings?.preorderEnabled);
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), 1400);
    return () => clearTimeout(timer);
  }, [justAdded]);

  if (product.stockQty <= 0 && !preorder) {
    return (
      <div className="buy">
        <button type="button" className="btn btn--block" disabled>
          {t.product.awaiting}
        </button>
      </div>
    );
  }

  const inCart = cart.qtyOf(product.id);
  const available = orderableQty(product, settings) - inCart;
  const shownQty = Math.max(1, Math.min(qty, available));
  const out = product.stockQty <= 0;

  return (
    <div className="buy">
      <p className="buy__notes">
        {out ? (
          <span className="buy__preorder">{t.product.preorderNote(settings?.preorderNote ?? '')}</span>
        ) : (
          product.stockQty <= LOW_STOCK && (
            <span className="buy__low">
              {t.product.left(product.stockQty)}
              {preorder && `, ${t.product.moreAsPreorder}`}
            </span>
          )
        )}
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
          {available <= 0 ? t.product.allInCart : justAdded ? `${t.product.added} ✓` : out ? t.product.preorder : t.product.addToCart}
        </button>
      </div>
    </div>
  );
}
