import { Link } from 'react-router-dom';
import { Catalog } from '../components/Catalog';
import { Hero } from '../components/Hero';
import { AboutPhoto, DeliveryInfo } from '../components/InfoBlocks';
import { ProductCard } from '../components/ProductCard';
import { Reveal } from '../components/Reveal';
import { t } from '../i18n';
import { paragraphs } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useShop } from '../state/ShopContext';

export default function Home() {
  useTitle();
  const { products, settings } = useShop();
  if (!settings) return null;

  const newProducts = products.filter((p) => p.isNew);
  const aboutTeaser = paragraphs(settings.aboutText)[0];

  return (
    <>
      <Hero settings={settings} />

      {newProducts.length > 0 && (
        <section className="section container" aria-labelledby="new-title">
          <Reveal>
            <h2 id="new-title" className="section__title">
              {t.home.newTitle}
            </h2>
          </Reveal>
          <div className="grid">
            {newProducts.map((product, i) => (
              <Reveal key={product.id} delay={i * 70}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section className="section container" id="catalog" aria-labelledby="catalog-title">
        <Reveal>
          <h2 id="catalog-title" className="section__title">
            {t.home.catalogTitle}
          </h2>
        </Reveal>
        <Catalog />
      </section>

      <section className="section section--tinted" aria-labelledby="about-title">
        <div className="container narrow">
          <Reveal>
            <div className="about">
              <AboutPhoto />
              <div>
                <h2 id="about-title" className="section__title">
                  {t.home.aboutTitle}
                </h2>
                {aboutTeaser && <p className="lead">{aboutTeaser}</p>}
                <Link to="/about" className="more-link">
                  {t.home.aboutMore} →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section container" aria-labelledby="delivery-title">
        <Reveal>
          <h2 id="delivery-title" className="section__title">
            {t.home.deliveryTitle}
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <DeliveryInfo settings={settings} />
          {paragraphs(settings.deliveryText).map((text, i) => (
            <p key={i} className="muted">
              {text}
            </p>
          ))}
        </Reveal>
      </section>
    </>
  );
}
