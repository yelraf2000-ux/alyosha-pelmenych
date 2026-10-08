import { CATEGORIES } from '@alyosha/shared';
import { useMemo, useState } from 'react';
import { t } from '../i18n';
import { useShop } from '../state/ShopContext';
import type { Category } from '../types';
import { ProductCard } from './ProductCard';
import { Reveal } from './Reveal';

/** Category chips and the product grid. Used on the home page and on /catalog. */
export function Catalog() {
  const { products } = useShop();
  const [active, setActive] = useState<Category | 'all'>('all');

  const categories = useMemo(
    () => CATEGORIES.filter((category) => products.some((p) => p.category === category)),
    [products],
  );
  const visible = active === 'all' ? products : products.filter((p) => p.category === active);

  return (
    <div className="catalog">
      {categories.length > 1 && (
        <div className="chips" role="group" aria-label={t.catalog.filterLabel}>
          {(['all', ...categories] as const).map((category) => (
            <button
              key={category}
              type="button"
              className={`chip${active === category ? ' chip--active' : ''}`}
              aria-pressed={active === category}
              onClick={() => setActive(category)}
            >
              {t.categories[category]}
            </button>
          ))}
        </div>
      )}
      {visible.length === 0 ? (
        <p className="muted">{t.catalog.empty}</p>
      ) : (
        <div className="grid">
          {visible.map((product, i) => (
            <Reveal key={product.id} delay={(i % 4) * 70}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
