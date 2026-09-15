import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// test/ sits one level below the backend package root.
const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('openapi contract', () => {
  it('parses openapi.yml from the package root and exposes the documented surface', async () => {
    const raw = await readFile(path.join(packageRoot, 'openapi.yml'), 'utf8');
    const doc = YAML.parse(raw) as { openapi: string; info: { title: string; version: string }; paths: Record<string, unknown> };

    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe('AI Interview Assistant API');
    expect(Object.keys(doc.paths).length).toBeGreaterThan(40);

    for (const p of ['/health', '/auth/register', '/auth/refresh', '/sessions', '/ai/question', '/ai/transcribe', '/resume/upload', '/resume/{id}/match', '/providers', '/account/export', '/usage', '/openapi.json']) {
      expect(doc.paths[p], `missing path ${p}`).toBeDefined();
    }
  });
});
