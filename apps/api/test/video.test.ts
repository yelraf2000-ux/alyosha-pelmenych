import ffmpegPath from 'ffmpeg-static';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES } from '../src/services/images';
import { addProduct, adminCookie, createTestContext, type TestContext } from './helpers';

let ctx: TestContext;
let clips: string;

/** Makes a test clip with ffmpeg's built-in test pattern, the way a phone would hand one over. */
function makeClip(name: string, size: string, seconds: number, extra: string[] = []): Buffer {
  const out = join(clips, name);
  execFileSync(ffmpegPath!, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`,
    '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', String(seconds), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
    ...extra,
    out,
  ]);
  return readFileSync(out);
}

function describeFile(file: string): string {
  return spawnSync(ffmpegPath!, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
}

function multipart(content: Buffer, filename: string, type: string) {
  const boundary = '----test-boundary';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), content, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie: adminCookie() },
  };
}

const uploadVideo = (id: number, content: Buffer, filename = 'clip.mp4', type = 'video/mp4') =>
  ctx.app.inject({ method: 'POST', url: `/api/admin/products/${id}/video`, ...multipart(content, filename, type) });

const videoFiles = () => (existsSync(join(ctx.uploadsDir, 'videos')) ? readdirSync(join(ctx.uploadsDir, 'videos')).sort() : []);

beforeAll(async () => {
  ctx = await createTestContext();
  clips = mkdtempSync(join(tmpdir(), 'alyosha-clips-'));
});
beforeEach(async () => {
  await ctx.reset();
  rmSync(join(ctx.uploadsDir, 'videos'), { recursive: true, force: true });
});
afterAll(async () => {
  await ctx.close();
  rmSync(clips, { recursive: true, force: true });
});

describe('product videos', () => {
  it('converts a vertical phone clip to a small silent MP4 with a poster', async () => {
    const id = await addProduct(ctx.db);

    const response = await uploadVideo(id, makeClip('portrait.mp4', '1080x1920', 2));

    expect(response.statusCode).toBe(200);
    const videoPath: string = response.json().product.videoPath;
    expect(videoPath).toMatch(/^\/uploads\/videos\/[a-f0-9]{16}-720x1280\.mp4$/);

    const stored = join(ctx.uploadsDir, videoPath.replace('/uploads/', ''));
    const info = describeFile(stored);
    expect(info).toMatch(/Video: h264/);
    expect(info).toContain('720x1280');
    expect(info).toContain('yuv420p');
    // Sound is removed.
    expect(info).not.toMatch(/Audio:/);

    // Read through a buffer: sharp keeps a file it opened by path locked for a while on Windows.
    const poster = await sharp(readFileSync(stored.replace(/\.mp4$/, '.webp'))).metadata();
    expect(poster).toMatchObject({ format: 'webp', width: 720, height: 1280 });

    // Only the finished files are left behind.
    expect(videoFiles()).toHaveLength(2);
    // Buyers get the path with the product.
    expect((await ctx.app.inject({ url: '/api/products' })).json()[0].videoPath).toBe(videoPath);
  });

  it('shrinks a wide clip to 720 px high and never enlarges a small one', async () => {
    const wide = await addProduct(ctx.db);
    const small = await addProduct(ctx.db);

    const wideResult = await uploadVideo(wide, makeClip('wide.mp4', '1920x1080', 1));
    const smallResult = await uploadVideo(small, makeClip('small.mp4', '320x240', 1));

    expect(wideResult.json().product.videoPath).toMatch(/-1280x720\.mp4$/);
    expect(smallResult.json().product.videoPath).toMatch(/-320x240\.mp4$/);
  });

  it('cuts a long clip to one minute', async () => {
    const id = await addProduct(ctx.db);

    const response = await uploadVideo(id, makeClip('long.mp4', '160x120', 75));

    const stored = join(ctx.uploadsDir, response.json().product.videoPath.replace('/uploads/', ''));
    expect(describeFile(stored)).toMatch(/Duration: 00:01:00\./);
  });

  it('accepts a clip larger than the photo limit', async () => {
    const id = await addProduct(ctx.db);
    // Lossless, so it is big: the photo limit must not apply to videos.
    const big = makeClip('big.mkv', '1920x1080', 4, ['-qp', '0']);
    expect(big.length).toBeGreaterThan(MAX_UPLOAD_BYTES);

    const response = await uploadVideo(id, big, 'big.mkv', 'video/x-matroska');

    expect(response.statusCode).toBe(200);
    expect(response.json().product.videoPath).toMatch(/-1280x720\.mp4$/);
  });

  it('serves the video in ranges, which phones need to play and seek', async () => {
    const id = await addProduct(ctx.db);
    const videoPath: string = (await uploadVideo(id, makeClip('range.mp4', '320x240', 1))).json().product.videoPath;

    const part = await ctx.app.inject({ url: videoPath, headers: { range: 'bytes=0-99' } });

    expect(part.statusCode).toBe(206);
    expect(part.headers['content-type']).toBe('video/mp4');
    expect(part.headers['content-range']).toMatch(/^bytes 0-99\/\d+$/);
    expect(part.rawPayload).toHaveLength(100);
    expect(part.headers['cache-control']).toContain('immutable');
  });

  it('removes the old files when a video is replaced, deleted, or its product is deleted', async () => {
    const id = await addProduct(ctx.db);
    const clip = makeClip('replace.mp4', '320x240', 1);

    await uploadVideo(id, clip);
    const first = videoFiles();
    await uploadVideo(id, clip);
    expect(videoFiles()).toHaveLength(2);
    expect(videoFiles()).not.toEqual(first);

    const removed = await ctx.app.inject({ method: 'DELETE', url: `/api/admin/products/${id}/video`, headers: { cookie: adminCookie() } });
    expect(removed.json().product.videoPath).toBeNull();
    expect(videoFiles()).toEqual([]);

    await uploadVideo(id, clip);
    await ctx.app.inject({ method: 'DELETE', url: `/api/admin/products/${id}`, headers: { cookie: adminCookie() } });
    expect(videoFiles()).toEqual([]);
  });

  it('rejects files that are not videos, and keeps the video the product had', async () => {
    const id = await addProduct(ctx.db);
    const good: string = (await uploadVideo(id, makeClip('keep.mp4', '320x240', 1))).json().product.videoPath;

    const text = await uploadVideo(id, Buffer.from('this is not a video'));
    const picture = await uploadVideo(
      id,
      await sharp({ create: { width: 640, height: 480, channels: 3, background: '#d9a066' } }).png().toBuffer(),
      'photo.png',
      'image/png',
    );

    for (const response of [text, picture]) {
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('bad_video');
    }
    expect((await ctx.app.inject({ url: '/api/products' })).json()[0].videoPath).toBe(good);
    expect(videoFiles()).toHaveLength(2);
  });

  it('rejects a file over 100 MB', async () => {
    const id = await addProduct(ctx.db);

    const response = await uploadVideo(id, Buffer.alloc(101 * 1024 * 1024, 1));

    expect(response.statusCode).toBe(413);
    expect(response.json().error).toBe('too_large');
    expect(videoFiles()).toEqual([]);
  });

  it('answers 404 for a product that does not exist', async () => {
    expect((await uploadVideo(999, Buffer.from('x'))).statusCode).toBe(404);
  });
});

describe('product photos of realistic size', () => {
  it('accepts a multi-megabyte photo from a phone', async () => {
    const id = await addProduct(ctx.db);
    // Noise does not compress, so this is a few megabytes, like a real camera photo.
    const noise = Buffer.alloc(2400 * 1800 * 3);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 7919 + (i >> 3) * 104729) & 0xff;
    const photo = await sharp(noise, { raw: { width: 2400, height: 1800, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    expect(statSync(clips).isDirectory() && photo.length).toBeGreaterThan(1024 * 1024);

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/products/${id}/image`,
      ...multipart(photo, 'photo.jpg', 'image/jpeg'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().product.imagePath).toMatch(/-1000\.webp$/);
  });
});
