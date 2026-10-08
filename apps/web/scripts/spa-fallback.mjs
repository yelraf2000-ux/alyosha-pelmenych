// Static hosts differ in how they serve unknown paths for a single-page app.
// Copy index.html to the fallback names they look for, so /product/... opens on refresh.
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = new URL(`../${process.argv[2] ?? 'dist'}/`, import.meta.url);
for (const name of ['404.html', '200.html']) {
  copyFileSync(fileURLToPath(new URL('index.html', dist)), fileURLToPath(new URL(name, dist)));
}
