import { smallImagePath } from '@alyosha/shared';
import { t } from '../i18n';
import type { Product } from '../types';
import { Dumpling } from './Dumpling';

/**
 * `large` is for the product page, where the photo spans half the screen or more.
 * Everywhere else it sits in a card, and phones get the 400px file.
 */
export function ProductPhoto({ product, large = false }: { product: Product; large?: boolean }) {
  if (product.imagePath) {
    const small = smallImagePath(product.imagePath);
    return (
      <div className="photo">
        <img
          src={product.imagePath}
          // Uploaded photos come in two sizes; anything else has just the one file.
          srcSet={small !== product.imagePath ? `${small} 400w, ${product.imagePath} 1000w` : undefined}
          sizes={large ? '(min-width: 900px) 50vw, 100vw' : '(min-width: 640px) 280px, 50vw'}
          alt={product.name}
          loading={large ? 'eager' : 'lazy'}
          decoding="async"
        />
      </div>
    );
  }

  // PLACEHOLDER picture until the client sends real photos: a drawn plate, clearly not a photo.
  return (
    <div className={`photo photo--placeholder photo--${product.category}`} role="img" aria-label={product.name}>
      <div className="photo__plate">
        <Dumpling kind={product.category} className="photo__art photo__art--a" />
        <Dumpling kind={product.category} className="photo__art photo__art--b" />
        <Dumpling kind={product.category} className="photo__art photo__art--c" />
      </div>
      <span className="photo__label">{t.product.photoPlaceholder}</span>
    </div>
  );
}
