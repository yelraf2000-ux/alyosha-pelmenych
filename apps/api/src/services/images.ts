import { randomBytes } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

// Product photos (SPEC §4) and the photos of news posts: uploaded in the admin, stored on disk
// under <uploads>/products and <uploads>/news, resized to 400px and 1000px WebP. File names are
// random and never reused, so the files can be cached forever.

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const SIZES = [400, 1000] as const;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const PUBLIC_PATH = /^\/uploads\/(products|news)\/([a-f0-9]{16})-1000\.webp$/;

/** Where a photo belongs: a product's or a news post's. */
export type ImageFolder = 'products' | 'news';

export class InvalidImageError extends Error {}

/** Returns the public path of the 1000px file, which is what `products.image_path` stores. */
export async function saveProductImage(uploadsDir: string, input: Buffer, folder: ImageFolder = 'products'): Promise<string> {
  // The real format is read from the file itself, not from its name or declared type.
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new InvalidImageError('not an image');
  }
  if (!format || !ALLOWED_FORMATS.has(format)) throw new InvalidImageError(`unsupported format: ${format}`);

  const dir = join(uploadsDir, folder);
  await mkdir(dir, { recursive: true });
  const name = randomBytes(8).toString('hex');

  try {
    for (const width of SIZES) {
      await sharp(input)
        .rotate() // apply the phone's EXIF orientation
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(join(dir, `${name}-${width}.webp`));
    }
  } catch {
    await removeFiles(dir, name);
    throw new InvalidImageError('image could not be processed');
  }

  return `/uploads/${folder}/${name}-1000.webp`;
}

export async function deleteProductImage(uploadsDir: string, publicPath: string | null): Promise<void> {
  const match = publicPath ? PUBLIC_PATH.exec(publicPath) : null;
  if (!match) return;
  await removeFiles(join(uploadsDir, match[1]!), match[2]!);
}

async function removeFiles(dir: string, name: string): Promise<void> {
  await Promise.all(SIZES.map((width) => unlink(join(dir, `${name}-${width}.webp`)).catch(() => undefined)));
}
