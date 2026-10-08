import type { FastifyInstance } from 'fastify';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers';

// Single-container mode (render.yaml): the API also serves the built storefront.

let ctx: TestContext;
let app: FastifyInstance;
let webDir: string;

beforeAll(async () => {
  ctx = await createTestContext();
  await ctx.reset();

  webDir = mkdtempSync(join(tmpdir(), 'alyosha-web-'));
  mkdirSync(join(webDir, 'assets'));
  mkdirSync(join(webDir, 'media'));
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>shop</title>');
  writeFileSync(join(webDir, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(webDir, 'media', 'hero-poster.webp'), 'not really an image');

  app = await ctx.buildApp({ webDir });
});

afterAll(async () => {
  await ctx.close();
  rmSync(webDir, { recursive: true, force: true });
});

describe('storefront served by the API', () => {
  it('serves the home page and gives client-side routes the same page', async () => {
    for (const url of ['/', '/catalog', '/product/manty', '/admin', '/admin/orders/5']) {
      const response = await app.inject({ url });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers['content-type'], url).toContain('text/html');
      expect(response.body, url).toContain('<title>shop</title>');
      // Pages are re-checked on every visit, so a new deploy shows up at once.
      expect(response.headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('caches hashed files forever and media for a week', async () => {
    const script = await app.inject({ url: '/assets/index-abc123.js' });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('javascript');
    expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    const media = await app.inject({ url: '/media/hero-poster.webp' });
    expect(media.headers['cache-control']).toBe('public, max-age=604800');
  });

  it('keeps the API an API', async () => {
    expect((await app.inject({ url: '/api/health' })).json()).toEqual({ ok: true });
    expect((await app.inject({ url: '/api/products' })).json()).toEqual([]);

    // Unknown API and upload paths answer 404, not the home page.
    const missing = await app.inject({ url: '/api/no-such-thing' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ ok: false, error: 'not_found' });
    expect((await app.inject({ url: '/uploads/products/missing-1000.webp' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/catalog' })).statusCode).toBe(404);

    // The admin API still needs a session.
    expect((await app.inject({ url: '/api/admin/orders' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/admin/no-such-route' })).statusCode).toBe(401);
  });

  it('does not serve files from outside the storefront folder', async () => {
    for (const url of ['/../package.json', '/..%2f..%2fpackage.json', '/assets/../../package.json']) {
      const response = await app.inject({ url });
      expect(response.body, url).not.toContain('"name"');
    }
  });

  it('sends the storefront with the security policy the pages were checked against', async () => {
    const page = await app.inject({ url: '/' });
    const policy = String(page.headers['content-security-policy']);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("img-src 'self' data: blob:");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('unsafe-inline');
  });
});

describe('without a storefront folder', () => {
  it('serves no pages (Caddy does that in the Docker Compose setup)', async () => {
    const response = await ctx.app.inject({ url: '/catalog' });
    expect(response.statusCode).toBe(404);
  });
});
