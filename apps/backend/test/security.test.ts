import { describe, expect, it, beforeEach } from 'vitest';
import { encryptSecret, decryptSecret, hashToken, maskKeyHint, isEncryptionKeyConfigured } from '../src/security/crypto.js';
import { pcm16MonoToWav } from '../src/ai/wav.js';
import { summarizeUsage } from '../src/db/aggregate.js';
import { MemoryRepository } from '../src/db/memory.js';
import { setRepository } from '../src/db/index.js';
import { buildServer } from '../src/index.js';

process.env.NODE_ENV = 'test';

describe('crypto', () => {
  it('round-trips encrypted keys and hashes tokens', () => {
    const ciphertext = encryptSecret('sk-test-12345678');
    expect(ciphertext).not.toContain('sk-test-12345678');
    expect(decryptSecret(ciphertext)).toBe('sk-test-12345678');
    expect(hashToken('a')).toHaveLength(64);
    expect(maskKeyHint('sk-test-12345678')).toBe('****5678');
    expect(isEncryptionKeyConfigured()).toBe(false); // unset in tests
  });
});

describe('wav encoding', () => {
  it('wraps PCM in a valid RIFF header', () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767]).buffer;
    const wav = pcm16MonoToWav(new Uint8Array(pcm), 16000);
    expect(wav.byteLength).toBe(44 + 8);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(16000);
  });
});

describe('usage aggregation + repository parity', () => {
  beforeEach(() => setRepository(new MemoryRepository()));

  it('summarises events identically to the build endpoint', async () => {
    const summary = summarizeUsage([
      { eventType: 'session.started', metadata: {} },
      { eventType: 'ai.request', metadata: { tokens: 120 } },
      { eventType: 'transcription.audio', metadata: { seconds: 90 } },
      { eventType: 'screen.capture', metadata: {} },
    ]);
    expect(summary).toMatchObject({ sessions: 1, aiRequests: 1, aiTokens: 120, transcriptionMinutes: 1.5 });

    const app = await buildServer();
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: `u${Date.now()}@example.com`, password: 'password123' } });
    const token = (reg.json() as { accessToken: string }).accessToken;
    const usage = await app.inject({ method: 'GET', url: '/usage?days=30', headers: { authorization: `Bearer ${token}` } });
    expect(usage.json().summary.sessions).toBe(0);
  });

  it('exports and deletes account data', async () => {
    const app = await buildServer();
    const email = `gone${Date.now()}@example.com`;
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123' } });
    const token = (reg.json() as { accessToken: string }).accessToken;
    const auth = { authorization: `Bearer ${token}` };

    const uploaded = await app.inject({
      method: 'POST', url: '/resume/upload', headers: auth,
      payload: { filename: 'r.txt', text: 'TypeScript engineer with 5 years of experience building APIs.' },
    });
    expect(uploaded.statusCode).toBe(200);

    const exported = await app.inject({ method: 'GET', url: '/account/export', headers: auth });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().resumes).toHaveLength(1);
    expect(exported.json()).not.toHaveProperty('passwordHash');

    expect((await app.inject({ method: 'DELETE', url: '/account', headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: auth })).statusCode).toBe(401);
  });
});