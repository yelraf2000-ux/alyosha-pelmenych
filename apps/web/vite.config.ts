import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs on its own port in development (apps/api, PORT in its .env).
// It also serves the uploaded product photos and videos. API_PROXY points at another instance.
const api = process.env.API_PROXY ?? 'http://localhost:3000';
const proxy = { '/api': api, '/uploads': api };

/** The static demo has no API, so index.html must not ask the browser to preload it. */
function dropApiPreloads(): Plugin {
  return {
    name: 'drop-api-preloads',
    transformIndexHtml: (html) => html.replace(/^.*data-api-preload.*\r?\n/gm, ''),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'demo' ? [dropApiPreloads()] : [])],
  server: { proxy },
  preview: { proxy },
  build: {
    // Never inline small files as data: URLs. The production Content-Security-Policy
    // (deploy/Caddyfile) only allows fonts and scripts from the site itself.
    assetsInlineLimit: 0,
  },
}));
