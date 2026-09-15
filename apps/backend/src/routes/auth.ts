import type { FastifyInstance } from 'fastify';
import { loginSchema, refreshSchema, registerSchema } from '@ai-assistant/shared';
import { hashPassword, signAccess, signRefresh, verifyPassword, verifyRefresh } from '../auth.js';
import { hashToken } from '../security/crypto.js';
import { audit, badRequest, bearerUserId, clientIp, parseInput, repo } from '../http/helpers.js';

const MAX_FAILED_LOGINS_PER_WINDOW = 10;

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', {
    config: { rateLimit: { max: MAX_FAILED_LOGINS_PER_WINDOW, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const parsed = parseInput(registerSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const { email, password } = parsed.data;
    if (await db.findUserByEmail(email)) return reply.code(409).send({ error: 'Email already registered' });

    const user = await db.createUser({ email, passwordHash: await hashPassword(password) });
    const refresh = signRefresh(user.id);
    await db.saveRefreshToken({ userId: user.id, tokenHash: hashToken(refresh.token), expiresAt: refresh.expiresAt });
    await audit(db, user.id, 'auth.register', 'user', clientIp(req));
    return {
      accessToken: signAccess(user.id),
      refreshToken: refresh.token,
      user: { id: user.id, email: user.email },
    };
  });

  app.post('/auth/login', {
    config: { rateLimit: { max: MAX_FAILED_LOGINS_PER_WINDOW, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const parsed = parseInput(loginSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const user = await db.findUserByEmail(parsed.data.email);
    const valid = user != null && (await verifyPassword(user.passwordHash, parsed.data.password));
    if (!user || !valid) {
      await audit(db, user?.id ?? null, 'auth.login_failed', 'user', clientIp(req));
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    const refresh = signRefresh(user.id);
    await db.saveRefreshToken({ userId: user.id, tokenHash: hashToken(refresh.token), expiresAt: refresh.expiresAt });
    await audit(db, user.id, 'auth.login', 'user', clientIp(req));
    return {
      accessToken: signAccess(user.id),
      refreshToken: refresh.token,
      user: { id: user.id, email: user.email },
    };
  });

  app.post('/auth/refresh', async (req, reply) => {
    const parsed = parseInput(refreshSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const claims = verifyRefresh(parsed.data.refreshToken);
    if (!claims) return reply.code(401).send({ error: 'Invalid refresh token' });

    const stored = await db.findRefreshToken(hashToken(parsed.data.refreshToken));
    if (!stored || stored.userId !== claims.userId) return reply.code(401).send({ error: 'Invalid refresh token' });
    if (stored.revokedAt != null) {
      // Replay of a rotated token: revoke the whole family and force re-auth.
      await db.revokeAllRefreshTokens(claims.userId);
      await audit(db, claims.userId, 'auth.refresh_reuse_detected', 'refresh_token', clientIp(req));
      return reply.code(401).send({ error: 'Refresh token already used' });
    }
    if (Date.parse(stored.expiresAt) <= Date.now()) {
      await db.revokeRefreshToken(stored.tokenHash);
      return reply.code(401).send({ error: 'Refresh token expired' });
    }

    await db.revokeRefreshToken(stored.tokenHash);
    const rotated = signRefresh(claims.userId);
    await db.saveRefreshToken({ userId: claims.userId, tokenHash: hashToken(rotated.token), expiresAt: rotated.expiresAt });
    await audit(db, claims.userId, 'auth.refresh', 'refresh_token', clientIp(req));
    return { accessToken: signAccess(claims.userId), refreshToken: rotated.token };
  });

  app.post('/auth/logout', async (req, reply) => {
    const body = (req.body ?? {}) as { refreshToken?: string; all?: boolean };
    const db = await repo();
    const userId = bearerUserId(req);
    if (userId && body.all) {
      await db.revokeAllRefreshTokens(userId);
      await audit(db, userId, 'auth.logout_all', 'refresh_token', clientIp(req));
      return { ok: true, revoked: 'all' };
    }
    if (body.refreshToken) await db.revokeRefreshToken(hashToken(body.refreshToken));
    if (userId) await audit(db, userId, 'auth.logout', 'refresh_token', clientIp(req));
    return reply.code(body.refreshToken || userId ? 200 : 400).send(body.refreshToken || userId ? { ok: true } : { error: 'Missing refreshToken' });
  });

  app.get('/auth/me', async (req, reply) => {
    const userId = bearerUserId(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const db = await repo();
    const user = await db.findUserById(userId);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    return {
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      settings: await db.getSettings(userId),
      privacy: await db.getPrivacy(userId),
    };
  });
}