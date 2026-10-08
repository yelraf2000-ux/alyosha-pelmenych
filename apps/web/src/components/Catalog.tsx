import { useMemo, useState } from 'react';
import { t } from '../i18n';
import { useShop } from '../state/ShopContext';
import { ProductCard } from './ProductCard';
import { Reveal } from './Reveal';

const ALL = '';

/** Category chips and the product grid. Used on the home page and on /catalog. */
export function Catalog() {
  const { products, categories } = useShop();
  /** The slug of the chosen category, or ALL. */
  const [active, setActive] = useState(ALL);

  // Only the categories that have something to show, in the owner's order.
  const shown = useMemo(
    () => categories.filter((category) => products.some((product) => product.category === category.slug)),
    [categories, products],
  );
  // If the chosen category has just lost its last product, fall back to everything.
  const chosen = shown.some((category) => category.slug === active) ? active : ALL;
  const visible = chosen === ALL ? products : products.filter((product) => product.category === chosen);

  return (
    <div className="catalog">
      {shown.length > 1 && (
        <div className="chips" role="group" aria-label={t.catalog.filterLabel}>
          {[{ slug: ALL, name: t.catalog.all }, ...shown].map((category) => (
            <button
              key={category.slug}
              type="button"
              className={`chip${chosen === category.slug ? ' chip--active' : ''}`}
              aria-pressed={chosen === category.slug}
              onClick={() => setActive(category.slug)}
            >
              {category.name}
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
