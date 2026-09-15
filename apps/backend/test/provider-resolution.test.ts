import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository } from '../src/db/memory.js';
import { setRepository } from '../src/db/index.js';
import { buildProvider, createProviderFromEnv, resolveProviderForUser } from '../src/ai/registry.js';
import { encryptSecret } from '../src/security/crypto.js';

process.env.NODE_ENV = 'test';

/** Registry reads env at call time; clear provider keys so host env can't skew results. */
const ENV_KEYS = ['AI_DEFAULT_PROVIDER', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY', 'DEEPGRAM_API_KEY', 'OPENAI_COMPAT_API_KEY', 'OLLAMA_BASE_URL'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
    else delete process.env[key];
  }
});

describe('provider resolution', () => {
  it('falls back to the offline template when no env provider is configured', () => {
    const provider = createProviderFromEnv();
    expect(provider.name).toBe('template-local');
    expect(provider.kind).toBe('local');
  });

  it('uses AI_DEFAULT_PROVIDER with its env key when available', () => {
    process.env.AI_DEFAULT_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    const provider = createProviderFromEnv();
    expect(provider.name).toBe('openai');
    expect(provider.kind).toBe('cloud');
  });

  it('builds adapters from presets and rejects chat-incompatible or unknown ids', () => {
    expect(buildProvider({ id: 'openai', apiKey: 'k' }).kind).toBe('cloud');
    expect(buildProvider({ id: 'ollama', apiKey: 'none', baseUrl: 'http://127.0.0.1:11434/v1' }).kind).toBe('local');
    expect(() => buildProvider({ id: 'nope', apiKey: 'k' })).toThrow(/Unknown AI provider/);
    expect(() => buildProvider({ id: 'deepgram', apiKey: 'k' })).toThrow(/speech-to-text only/);
    expect(() => buildProvider({ id: 'openai-compatible', apiKey: 'k' })).toThrow(/base URL/i);
  });

  it('resolves per-user providers: privacy gate → stored provider → env → template', async () => {
    const db = new MemoryRepository();
    setRepository(db);
    const { id: userId } = await db.createUser({ email: `resolve${Date.now()}@example.com`, passwordHash: 'unused' });

    // No stored provider, no env keys → offline template.
    expect((await resolveProviderForUser(db, userId)).name).toBe('template-local');

    // Env fallback applies when the user has no stored default.
    process.env.OPENAI_API_KEY = 'sk-test';
    expect((await resolveProviderForUser(db, userId)).name).toBe('openai');
    delete process.env.OPENAI_API_KEY;

    // Stored (encrypted) provider wins over env.
    await db.upsertProvider({
      userId, provider: 'ollama', encryptedApiKey: encryptSecret('local-key'), isDefault: true,
      baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.1',
    });
    await db.updateSettings(userId, { defaultProvider: 'ollama' });
    const resolved = await resolveProviderForUser(db, userId);
    expect(resolved.name).toBe('ollama');
    expect(resolved.kind).toBe('local');

    // Privacy gate beats everything: cloud AI off → template, even with a stored provider.
    await db.updatePrivacy(userId, { cloudAi: false });
    expect((await resolveProviderForUser(db, userId)).name).toBe('template-local');
    await db.updatePrivacy(userId, { cloudAi: true });

    // Undecryptable stored key degrades to the env default instead of throwing.
    await db.upsertProvider({ userId, provider: 'openai', encryptedApiKey: 'v1:not:real:key', isDefault: true });
    await db.updateSettings(userId, { defaultProvider: 'openai' });
    expect((await resolveProviderForUser(db, userId)).name).toBe('template-local');
  });
});
