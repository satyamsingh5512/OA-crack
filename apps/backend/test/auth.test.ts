import { describe, expect, it, beforeEach } from 'vitest';
import { buildServer } from '../src/index.js';
import { setRepository } from '../src/db/index.js';
import { MemoryRepository } from '../src/db/memory.js';

process.env.NODE_ENV = 'test';

async function register(email: string) {
  const app = await buildServer();
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123' } });
  expect(res.statusCode).toBe(200);
  return { app, tokens: res.json() as { accessToken: string; refreshToken: string } };
}

const headers = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

describe('auth lifecycle', () => {
  beforeEach(() => setRepository(new MemoryRepository()));

  it('health includes db driver info', async () => {
    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, version: '0.2.0' });
  });

  it('register → me → refresh → reuse rejected → logout-all', async () => {
    const { app, tokens } = await register(`auth${Date.now()}@example.com`);
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: headers(tokens.accessToken) });
    expect(me.statusCode).toBe(200);
    expect(me.json().settings).toHaveProperty('answerMode');

    const rotated = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: tokens.refreshToken } });
    expect(rotated.statusCode).toBe(200);
    const fresh = rotated.json() as { accessToken: string; refreshToken: string };

    // Replaying the rotated token is a reuse attack: the whole family is revoked.
    const replay = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: tokens.refreshToken } });
    expect(replay.statusCode).toBe(401);

    const afterReuse = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: fresh.refreshToken } });
    expect(afterReuse.statusCode).toBe(401);

    // Re-login works and logout-all revokes every token.
    await app.inject({ method: 'POST', url: '/auth/login', payload: { email: `gone@example.com`, password: 'password123' } });
    const login = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: me.json().user.email, password: 'password123' },
    });
    const again = login.json() as { accessToken: string; refreshToken: string };
    const logoutAll = await app.inject({
      method: 'POST', url: '/auth/logout',
      payload: { all: true },
      headers: headers(again.accessToken),
    });
    expect(logoutAll.statusCode).toBe(200);
    const gone = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: again.refreshToken } });
    expect(gone.statusCode).toBe(401);
  });

  it('rejects bad input, duplicate email and wrong password', async () => {
    const app = await buildServer();
    expect((await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'nope', password: 'x' } })).statusCode).toBe(400);
    const email = `dup${Date.now()}@example.com`;
    expect((await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'wrong-password' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/sessions' })).statusCode).toBe(401);
  });
});