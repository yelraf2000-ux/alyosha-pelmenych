import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
/** The handle passed to a `db.transaction(async (tx) => …)` callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(connectionString: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString, max: 10 });
  // An idle connection dropped by the server (restart, network) must not take the API down;
  // the pool opens a new one on the next query.
  pool.on('error', (error) => console.error('Postgres connection lost:', error.message));
  return { db: drizzle(pool, { schema }), pool };
}
