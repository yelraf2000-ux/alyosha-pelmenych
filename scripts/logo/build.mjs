// Builds the logo files the site serves from the picture Алексей sent (source.jpg next to this file):
//
//   apps/web/public/logo/logo-720.webp        the logo on its light blue background, square;
//                                             the page rounds it into a disc
//   apps/web/public/logo/logo-bare-720.webp   the same square with the blue made transparent:
//                                             the dumplings and both lines of lettering only
//
//   node scripts/logo/build.mjs
//
// Both squares are cut from the same place, so the page can lay one over the other and fade
// between them. A new logo picture: replace source.jpg, check the numbers below, run this, deploy.

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SOURCE = fileURLToPath(new URL('./source.jpg', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../apps/web/public/logo/', import.meta.url));

/** The picture's flat background, and where the logo sits in it (measured from the picture). */
const BACKGROUND = [187, 222, 242];
const CENTRE = { x: 562, y: 1015 };
/** The lettering reaches 431 px from the centre; the rest is the disc's margin around it. */
const RADIUS = 468;
const SIZE = 720;

/** How far a colour must be from the background to count as partly (NEAR) or wholly (FAR) logo. */
const NEAR = 10;
const FAR = 52;

mkdirSync(OUT_DIR, { recursive: true });

const square = sharp(SOURCE).extract({
  left: CENTRE.x - RADIUS,
  top: CENTRE.y - RADIUS,
  width: RADIUS * 2,
  height: RADIUS * 2,
});

await square.clone().resize(SIZE, SIZE).webp({ quality: 90 }).toFile(`${OUT_DIR}logo-720.webp`);

// Without the background: each pixel becomes as opaque as it is unlike the blue, and the blue it
// was mixed with along the edges is taken back out of its colour, so no blue rim is left.
const { data, info } = await square.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
const bare = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, o = 0; i < data.length; i += 3, o += 4) {
  const distance = Math.hypot(data[i] - BACKGROUND[0], data[i + 1] - BACKGROUND[1], data[i + 2] - BACKGROUND[2]);
  const alpha = Math.min(1, Math.max(0, (distance - NEAR) / (FAR - NEAR)));
  for (let channel = 0; channel < 3; channel += 1) {
    const colour = alpha === 0 ? 0 : (data[i + channel] - (1 - alpha) * BACKGROUND[channel]) / alpha;
    bare[o + channel] = Math.min(255, Math.max(0, Math.round(colour)));
  }
  bare[o + 3] = Math.round(alpha * 255);
}
await sharp(bare, { raw: { width: info.width, height: info.height, channels: 4 } })
  .resize(SIZE, SIZE)
  .webp({ quality: 90, alphaQuality: 100 })
  .toFile(`${OUT_DIR}logo-bare-720.webp`);

console.log(`Logo files written to ${OUT_DIR}`);
