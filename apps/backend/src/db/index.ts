import { MemoryRepository } from './memory.js';
import { PgRepository } from './pg.js';
import { tryConnect } from './client.js';
import type { Repository } from './types.js';

let current: Repository | null = null;
let pgPool: { end: () => Promise<void> } | null = null;

export interface RepositoryOptions {
  /** Force a driver (tests, or when the operator knows the DB is up). */
  force?: 'postgres' | 'memory';
}

/**
 * Resolves the active repository once per process.
 *
 * Production (`REQUIRE_DATABASE=true`) fails fast when PostgreSQL is unreachable.
 * Otherwise the API degrades gracefully to the process-local store so the desktop
 * client keeps working through a database outage (§16) and unit tests stay hermetic.
 */
export async function getRepository(opts: RepositoryOptions = {}): Promise<Repository> {
  if (current && !opts.force) return current;
  if (opts.force === 'memory') { current = new MemoryRepository(); return current; }
  if (!process.env.DATABASE_URL && !opts.force) {
    current = new MemoryRepository();
    return current;
  }
  const connected = await tryConnect();
  if (connected) {
    pgPool = connected.pool;
    current = new PgRepository(connected.db);
    return current;
  }
  if (process.env.REQUIRE_DATABASE === 'true' || opts.force === 'postgres') {
    throw new Error('PostgreSQL is unreachable and REQUIRE_DATABASE=true');
  }
  current = new MemoryRepository();
  return current;
}

/** Test seam: inject a repository (e.g. a fresh MemoryRepository per suite). */
export function setRepository(repo: Repository | null): void {
  current = repo;
}

/** Graceful shutdown: release pool sockets so `app.close()` does not hang. */
export async function closeRepository(): Promise<void> {
  if (pgPool) {
    await pgPool.end().catch(() => undefined);
    pgPool = null;
  }
  current = null;
}

export { MemoryRepository, PgRepository };
export type { Repository } from './types.js';