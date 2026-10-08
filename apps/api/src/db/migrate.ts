import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDb } from './client';

// The SQL files are in apps/api/drizzle. Seen from this file that is two levels up in development
// (src/db/) and one level up in the production bundle (dist/); MIGRATIONS_DIR overrides both.
const candidates = [
  process.env.MIGRATIONS_DIR,
  fileURLToPath(new URL('../../drizzle', import.meta.url)),
  fileURLToPath(new URL('../drizzle', import.meta.url)),
].filter((dir): dir is string => Boolean(dir));
const migrationsFolder = candidates.find((dir) => existsSync(join(dir, 'meta', '_journal.json'))) ?? candidates[0]!;

/** Applies every migration in apps/api/drizzle that the database has not seen yet. */
export async function runMigrations(connectionString: string): Promise<void> {
  const { db, pool } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

// `npm run db:migrate`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. See apps/api/.env.example.');
  await runMigrations(url);
  console.log('Migrations applied.');
}
