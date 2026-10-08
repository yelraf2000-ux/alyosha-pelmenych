// Production build of the API: one self-contained file per entry point in dist/.
// The shared workspace package is compiled in; npm packages stay external and are installed
// in the image with `npm ci --omit=dev` (sharp ships native binaries and cannot be bundled).

import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: {
    server: 'src/server.ts',
    migrate: 'src/db/migrate.ts',
    seed: 'src/db/seed.ts',
    'set-admin-password': 'src/cli/set-admin-password.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  alias: { '@alyosha/shared': '../../packages/shared/src/index.ts' },
  sourcemap: true,
  logLevel: 'info',
});
