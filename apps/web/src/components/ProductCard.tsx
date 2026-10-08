import { Link } from 'react-router-dom';
import { t } from '../i18n';
import { formatAmd } from '../lib/format';
import type { Product } from '../types';
import { ProductPhoto } from './ProductPhoto';
import { PurchaseControls } from './PurchaseControls';

export function ProductCard({ product }: { product: Product }) {
  const href = `/product/${product.slug}`;
  const out = product.stockQty <= 0;

  return (
    <article className={`card${out ? ' card--out' : ''}`}>
      <Link to={href} className="card__media" tabIndex={-1} aria-hidden="true">
        <ProductPhoto product={product} />
      </Link>
      {product.isNew && <span className="badge card__badge">{t.product.isNew}</span>}
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
