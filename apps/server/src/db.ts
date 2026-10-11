import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const db = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX,
  keepAlive: true,
});

// Un client inactif du pool peut être coupé par le pooler Neon (ECONNABORTED /
// ECONNRESET). Sans listener, l'événement 'error' du Pool est fatal et fait
// tomber tout le process (Render : "Exited with status 1", 2026-10-07).
// pg retire le client cassé du pool ; on journalise et on continue.
db.on('error', (error) => {
  console.error('[db] idle client error (ignored):', error.message);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return db.query<T>(text, values);
}

export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
