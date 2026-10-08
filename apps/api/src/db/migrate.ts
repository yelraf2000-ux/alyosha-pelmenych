import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDb } from './client';

// In development the SQL files sit next to the source. The production image is a bundle,
// so the Dockerfile points MIGRATIONS_DIR at the copied folder instead.
const migrationsFolder = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../../drizzle', import.meta.url));

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
