import { categoryName } from '@alyosha/shared';
import { Link, useParams } from 'react-router-dom';
import { ProductPhoto } from '../components/ProductPhoto';
import { ProductVideo } from '../components/ProductVideo';
import { PurchaseControls } from '../components/PurchaseControls';
import { t } from '../i18n';
import { formatAmd, paragraphs } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useShop } from '../state/ShopContext';

export default function ProductPage() {
  const { slug } = useParams();
  const { products, categories } = useShop();
  const product = products.find((p) => p.slug === slug);
  useTitle(product?.name ?? t.product.notFoundTitle);

  if (!product) {
    return (
      <div className="section container narrow state">
        <h1>{t.product.notFoundTitle}</h1>
        <p>{t.product.notFoundText}</p>
        <Link to="/catalog" className="btn btn--primary">
          {t.product.toCatalog}
        </Link>
      </div>
    );
  }

  return (
    <div className="section container">
      <nav className="crumbs" aria-label={t.nav.breadcrumbs}>
        <Link to="/catalog">{t.nav.catalog}</Link>
        <span aria-hidden="true">/</span>
        <span>{categoryName(categories, product.category)}</span>
      </nav>
      <div className="product">
        <div className="product__media">
          <ProductPhoto product={product} large />
          {product.isNew && <span className="badge card__badge">{t.product.isNew}</span>}
        </div>
        <div className="product__info">
          <h1>{product.name}</h1>
          <p className="product__meta">{product.weightLabel}</p>
          <p className="product__price">{formatAmd(product.priceAmd)}</p>
          {/* key: reset the stepper when moving between products */}
          <PurchaseControls key={product.id} product={product} />
          {product.description.trim() && (
            <>
              <h2 className="product__subtitle">{t.product.description}</h2>
              {paragraphs(product.description).map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </>
          )}
        </div>
      </div>

      {product.videoPath && (
        <section className="product-video" aria-labelledby="product-video-title">
          <h2 id="product-video-title" className="product__subtitle">
            {t.product.video}
          </h2>
          {/* key: a fresh player when moving between products */}
          <ProductVideo key={product.videoPath} path={product.videoPath} label={`${t.product.video}: ${product.name}`} />
        </section>
      )}
    </div>
  );
}
