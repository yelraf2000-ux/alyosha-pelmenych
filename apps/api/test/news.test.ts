import ffmpegPath from 'ffmpeg-static';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newsExcerpt, type NewsPostInput } from '@alyosha/shared';
import type { InjectOptions } from 'fastify';
import { adminCookie, createTestContext, type TestContext } from './helpers';

let ctx: TestContext;
let clips: string;

beforeAll(async () => {
  ctx = await createTestContext();
  clips = mkdtempSync(join(tmpdir(), 'alyosha-news-clips-'));
});
beforeEach(async () => {
  await ctx.reset();
});
afterAll(async () => {
  await ctx.close();
  rmSync(clips, { recursive: true, force: true });
});

function asAdmin(options: InjectOptions) {
  return ctx.app.inject({ ...options, headers: { ...options.headers, cookie: adminCookie() } });
}

const post = (overrides: Partial<NewsPostInput> = {}): NewsPostInput => ({
  title: 'Новые манты',
  text: 'Теперь с тыквой.\n\nПробуйте!',
  publishedOn: '2026-10-20',
  isPublished: true,
  ...overrides,
});

async function createPost(overrides: Partial<NewsPostInput> = {}) {
  const response = await asAdmin({ method: 'POST', url: '/api/admin/news', payload: post(overrides) });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: number };
}

function multipart(content: Buffer, filename: string, type: string) {
  const boundary = '----test-boundary';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), content, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const onDisk = (publicPath: string) => join(ctx.uploadsDir, publicPath.replace('/uploads/', ''));

describe('news in the admin and on the site', () => {
  it('creates, rewrites and deletes a post; the site lists published ones, newest first', async () => {
    const older = await createPost({ title: 'Старая', publishedOn: '2026-09-01' });
    const newer = await createPost({ title: 'Свежая', publishedOn: '2026-10-25' });
    const hidden = await createPost({ title: 'Черновик', publishedOn: '2026-10-27', isPublished: false });

    const site = (await ctx.app.inject({ url: '/api/news' })).json();
    expect(site.map((p: { title: string }) => p.title)).toEqual(['Свежая', 'Старая']);
    expect(site[0]).toEqual({
      id: newer.id,
      title: 'Свежая',
      text: 'Теперь с тыквой.\n\nПробуйте!',
      imagePath: null,
      videoPath: null,
      publishedOn: '2026-10-25',
    });
    expect((await ctx.app.inject({ url: '/api/news?limit=1' })).json()).toHaveLength(1);

    // A hidden post is not on the site, even by its address; the admin sees it.
    expect((await ctx.app.inject({ url: `/api/news/${hidden.id}` })).statusCode).toBe(404);
    expect((await ctx.app.inject({ url: `/api/news/${older.id}` })).json().title).toBe('Старая');
    const admin = (await asAdmin({ url: '/api/admin/news' })).json();
    expect(admin.map((p: { title: string; isPublished: boolean }) => [p.title, p.isPublished])).toEqual([
      ['Черновик', false],
      ['Свежая', true],
      ['Старая', true],
    ]);

    const rewritten = await asAdmin({
      method: 'PUT',
      url: `/api/admin/news/${hidden.id}`,
      payload: post({ title: '  Уже не черновик ', publishedOn: '2026-10-28' }),
    });
    expect(rewritten.json()).toMatchObject({ title: 'Уже не черновик', isPublished: true });
    expect((await ctx.app.inject({ url: '/api/news' })).json()[0].title).toBe('Уже не черновик');

    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/news/${older.id}` })).statusCode).toBe(200);
    expect((await ctx.app.inject({ url: `/api/news/${older.id}` })).statusCode).toBe(404);
    expect((await asAdmin({ method: 'DELETE', url: `/api/admin/news/${older.id}` })).statusCode).toBe(404);
  });

  it('refuses a post without a title or with a date that does not exist', async () => {
    for (const bad of [post({ title: '  ' }), post({ publishedOn: '2026-02-30' }), { title: 'Без даты' }]) {
      expect((await asAdmin({ method: 'POST', url: '/api/admin/news', payload: bad })).statusCode).toBe(400);
    }
  });

  it('is closed to anyone without the admin session', async () => {
    for (const route of [
      { method: 'GET', url: '/api/admin/news' },
      { method: 'POST', url: '/api/admin/news', payload: post() },
      { method: 'PUT', url: '/api/admin/news/1', payload: post() },
      { method: 'DELETE', url: '/api/admin/news/1' },
      { method: 'POST', url: '/api/admin/news/1/image' },
      { method: 'POST', url: '/api/admin/news/1/video' },
    ] as const) {
      expect((await ctx.app.inject(route)).statusCode).toBe(401);
    }
  });

  it('keeps a photo in the news folder in two sizes and removes it with the post', async () => {
    const { id } = await createPost();
    const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#d9a066' } }).jpeg().toBuffer();

    const uploaded = await asAdmin({ method: 'POST', url: `/api/admin/news/${id}/image`, ...multipart(photo, 'photo.jpg', 'image/jpeg') });
    expect(uploaded.statusCode).toBe(200);
    const imagePath: string = uploaded.json().imagePath;
    expect(imagePath).toMatch(/^\/uploads\/news\/[a-f0-9]{16}-1000\.webp$/);
    expect(existsSync(onDisk(imagePath.replace('-1000.', '-400.')))).toBe(true);

    await asAdmin({ method: 'DELETE', url: `/api/admin/news/${id}` });
    expect(existsSync(onDisk(imagePath))).toBe(false);
  });

  it('keeps the sound of a news video', async () => {
    const { id } = await createPost();
    const clip = join(clips, 'talk.mp4');
    execFileSync(ffmpegPath!, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440',
      '-t', '1', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
      clip,
    ]);

    const uploaded = await asAdmin({ method: 'POST', url: `/api/admin/news/${id}/video`, ...multipart(readFileSync(clip), 'talk.mp4', 'video/mp4') });
    expect(uploaded.statusCode).toBe(200);
    const videoPath: string = uploaded.json().videoPath;
    const info = spawnSync(ffmpegPath!, ['-hide_banner', '-i', onDisk(videoPath)], { encoding: 'utf8' }).stderr;
    expect(info).toMatch(/Video: h264/);
    expect(info).toMatch(/Audio: aac/);
    expect((await ctx.app.inject({ url: `/api/news/${id}` })).json().videoPath).toBe(videoPath);
  });
});

describe('newsExcerpt', () => {
  it('takes the first paragraph and cuts a long one at a word', () => {
    expect(newsExcerpt('Коротко.\n\nДальше.')).toBe('Коротко.');
    const long = 'слово '.repeat(60).trim();
    const excerpt = newsExcerpt(long, 50);
    expect(excerpt.length).toBeLessThanOrEqual(51);
    expect(excerpt.endsWith('слово…')).toBe(true);
  });
});
