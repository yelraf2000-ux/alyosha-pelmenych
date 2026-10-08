// Builds the product pictures the site serves: apps/web/public/products/<slug>-1000.webp and -400.webp.
//
//   node scripts/product-art/build.mjs
//
// For each product the source is, in this order:
//   1. a picture in scripts/product-art/incoming/ named after the product's slug
//      (pelmeni-govyazhi.png, .jpg, .jpeg or .webp), cropped to 4:3 around its centre;
//   2. otherwise the illustration drawn by draw.mjs.
//
// Products keep the same picture address either way (/products/<slug>-1000.webp), so replacing
// a picture is: put the file into incoming/, run this, commit, deploy. No database change.

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { drawIllustrations } from './draw.mjs';

const INCOMING = fileURLToPath(new URL('./incoming/', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../apps/web/public/products/', import.meta.url));
const SIZES = [1000, 400];
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const supplied = existsSync(INCOMING) ? readdirSync(INCOMING) : [];

for (const [slug, svg] of drawIllustrations()) {
  const file = supplied.find((name) => EXTENSIONS.some((ext) => name.toLowerCase() === `${slug}.${ext}`));
  const source = file ? `${INCOMING}${file}` : Buffer.from(svg);
  const { width } = await sharp(source).metadata();

  for (const size of SIZES) {
    await sharp(source, file ? {} : { density: 144 })
      .rotate()
      .resize(size, Math.round((size * 3) / 4), { fit: 'cover' })
      .webp({ quality: file ? 82 : 90 })
      .toFile(`${OUT_DIR}${slug}-${size}.webp`);
  }

  const note = file ? `${file} (${width}px wide${width < 1000 ? ', SMALLER THAN 1000px: will look soft' : ''})` : 'drawn illustration';
  console.log(`${slug.padEnd(34)} ${note}`);
}

const unknown = supplied.filter((name) => !drawIllustrations().has(name.replace(/\.[^.]+$/, '')));
if (unknown.length > 0) {
  console.log(`\nNot used (the name is not a product slug): ${unknown.join(', ')}`);
}
