import { CATEGORIES } from '@alyosha/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Catalog } from '../components/Catalog';
import { FilmModal } from '../components/FilmModal';
import { Hero, PlayIcon } from '../components/Hero';
import { ContactsList, DeliveryCards } from '../components/InfoBlocks';
import { ProductCard } from '../components/ProductCard';
import { Reveal } from '../components/Reveal';
import { t } from '../i18n';
import { paragraphs } from '../lib/format';
import { useTitle } from '../lib/useTitle';
import { useShop } from '../state/ShopContext';
import type { Category } from '../types';

/** The moving strip names only what is actually in the catalog. */
function Marquee({ categories }: { categories: Category[] }) {
  const words = [...categories.map((category) => t.categories[category]), t.home.handmade, t.home.city];
  // The track holds the list four times and slides by half its width, so the loop has no seam.
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track">
        {Array.from({ length: 4 }, (_, copy) =>
          words.map((word) => (
            <span key={`${copy}-${word}`} className="marquee__item">
              {word}
              <i>✦</i>
            </span>
          )),
        )}
      </div>
    </div>
  );
}

export default function Home() {
  useTitle();
  const { products, settings } = useShop();
  const [filmOpen, setFilmOpen] = useState(false);
  if (!settings) return null;

  const newProducts = products.filter((p) => p.isNew);
  const aboutTeaser = paragraphs(settings.aboutText)[0];

  return (
    <>
      <Hero settings={settings} onWatchFilm={() => setFilmOpen(true)} />
      <Marquee
        categories={CATEGORIES.filter((category) => category !== 'other' && products.some((p) => p.category === category))}
      />

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

      <section className="story" aria-labelledby="about-title">
        <div className="container story__inner">
          <Reveal className="story__media">
            <button type="button" className="story__play" onClick={() => setFilmOpen(true)}>
              <img src="/media/about.webp" alt="" width={960} height={540} loading="lazy" decoding="async" />
              <span className="story__play-btn">
                <PlayIcon />
                <span>{t.home.watchFilm}</span>
              </span>
            </button>
            <p className="story__caption">{t.home.filmFrame}</p>
          </Reveal>
          <Reveal className="story__text" delay={120}>
            <p className="story__tag">
              <span aria-hidden="true">✦</span> {t.home.aboutTitle}
            </p>
            <h2 id="about-title">{t.home.tagline}</h2>
            {aboutTeaser && <p className="lead">{aboutTeaser}</p>}
            <Link to="/about" className="btn btn--glass">
              {t.home.aboutMore} →
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="section container" aria-labelledby="delivery-title">
        <Reveal>
          <h2 id="delivery-title" className="section__title">
            {t.home.deliveryTitle}
          </h2>
        </Reveal>
        <div className="delivery">
          <Reveal className="delivery__media">
            <img src="/media/delivery.webp" alt="" width={960} height={540} loading="lazy" decoding="async" />
            <span className="delivery__caption">{t.home.filmFrame}</span>
          </Reveal>
          <Reveal delay={100}>
            <DeliveryCards settings={settings} />
            <Link to="/delivery" className="more-link">
              {t.home.deliveryMore} →
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="section container" aria-labelledby="contacts-title">
        <Reveal>
          <h2 id="contacts-title" className="section__title">
            {t.home.contactsTitle}
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <ContactsList settings={settings} />
        </Reveal>
      </section>

      {filmOpen && <FilmModal onClose={() => setFilmOpen(false)} />}
    </>
  );
}
