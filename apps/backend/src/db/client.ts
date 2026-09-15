import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Db } from './pg.js';

/** Pool tuned for a small API + realtime process; never exposed to clients. */
export function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5_000),
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  });
}

export function createDb(pool: Pool): Db {
  return drizzle(pool) as unknown as Db;
}

/** Resolves a live connection or null (used for graceful degradation, §16). */
export async function tryConnect(): Promise<{ pool: Pool; db: Db } | null> {
  if (!process.env.DATABASE_URL) return null;
  let pool: Pool | null = null;
  try {
    pool = createPool();
    const db = createDb(pool);
    await db.execute('select 1');
    return { pool, db };
  } catch {
    await pool?.end().catch(() => undefined);
    return null;
  }
}