import { Link } from 'react-router-dom';
import { t } from '../i18n';
import { useShop } from '../state/ShopContext';
import { formatAmd } from '../lib/format';
import type { Product } from '../types';
import { ProductPhoto } from './ProductPhoto';
import { PurchaseControls } from './PurchaseControls';

export function ProductCard({ product }: { product: Product }) {
  const href = `/product/${product.slug}`;
  const { settings } = useShop();
  const out = product.stockQty <= 0;
  const preorder = out && Boolean(settings?.preorderEnabled);

  return (
    <article className={`card${out && !preorder ? ' card--out' : ''}`}>
      <Link to={href} className="card__media" tabIndex={-1} aria-hidden="true">
        <ProductPhoto product={product} />
      </Link>
      <ProductBadges product={product} preorder={preorder} />
      <div className="card__body">
        <h3 className="card__title">
          <Link to={href}>{product.name}</Link>
        </h3>
        <p className="card__meta">{product.weightLabel}</p>
        <p className="card__price">{formatAmd(product.priceAmd)}</p>
        <PurchaseControls product={product} />
      </div>
    </article>
  );
}

/** «Новинка», the owner's own labels and «Под заказ», stacked in the picture's corner. */
export function ProductBadges({ product, preorder }: { product: Product; preorder: boolean }) {
  if (!product.isNew && product.badges.length === 0 && !preorder) return null;
  return (
    <span className="card__badges">
      {product.isNew && <span className="badge">{t.product.isNew}</span>}
      {product.badges.map((badge) => (
        <span key={badge} className="badge badge--own">
          {badge}
        </span>
      ))}
      {preorder && <span className="badge badge--preorder">{t.product.preorderBadge}</span>}
    </span>
  );
}
