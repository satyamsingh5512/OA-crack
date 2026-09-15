import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

export interface RefreshClaims { userId: string; jti: string; expiresAt: string }

export async function hashPassword(pw: string): Promise<string> {
  return argon2.hash(pw, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, pw: string): Promise<boolean> {
  try { return await argon2.verify(hash, pw); } catch { return false; }
}

/** Short-lived access token (15m). Never carries secrets or PII beyond the user id. */
export function signAccess(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'access' }, config.jwt.accessSecret, { expiresIn: config.jwt.accessTtl });
}

/** Rotating refresh token (14d) with a unique jti; only its hash is persisted. */
export function signRefresh(userId: string): RefreshClaims & { token: string } {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 86_400_000);
  const token = jwt.sign({ sub: userId, typ: 'refresh', jti }, config.jwt.refreshSecret, { expiresIn: `${config.jwt.refreshTtlDays}d` });
  return { token, userId, jti, expiresAt: expiresAt.toISOString() };
}

export function verifyAccess(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret) as { sub?: string; typ?: string };
    return payload.typ === 'access' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch { return null; }
}

export function verifyRefresh(token: string): { userId: string; jti: string } | null {
  try {
    const payload = jwt.verify(token, config.jwt.refreshSecret) as { sub?: string; typ?: string; jti?: string };
    if (payload.typ !== 'refresh' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') return null;
    return { userId: payload.sub, jti: payload.jti };
  } catch { return null; }
}
