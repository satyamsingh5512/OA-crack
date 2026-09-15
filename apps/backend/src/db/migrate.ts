import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { createDb, createPool } from './client.js';

/**
 * Minimal, dependency-free migration runner.
 * Migrations are plain, numbered SQL files in /infrastructure/migrations and are
 * recorded in `schema_migrations`. Applied files are never re-run and never edited.
 */
export function migrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  // src/db/ and dist/db/ are both two levels below the backend package root.
  return path.resolve(fileURLToPath(new URL('../../../../infrastructure/migrations', import.meta.url)));
}

export async function listMigrationFiles(dir = migrationsDir()): Promise<string[]> {
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

export async function runMigrations(pool: Pool, dir = migrationsDir()): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`);
    const { rows } = await client.query<{ version: string }>('select version from schema_migrations');
    const done = new Set(rows.map((r) => r.version));
    for (const file of await listMigrationFiles(dir)) {
      if (done.has(file)) continue;
      const sqlText = await readFile(path.join(dir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sqlText);
        await client.query('insert into schema_migrations (version) values ($1)', [file]);
        await client.query('commit');
        applied.push(file);
      } catch (err) {
        await client.query('rollback');
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${file} failed: ${detail}`, { cause: err });
      }
    }
    return applied;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const pool = createPool();
  createDb(pool); // fail fast on dialect/config problems
  try {
    const applied = await runMigrations(pool);
    if (applied.length === 0) console.log('Database is up to date (no pending migrations).');
    else console.log(`Applied migrations:\n  ${applied.join('\n  ')}`);
  } finally {
    await pool.end();
  }
}

const invokedDirectly = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}