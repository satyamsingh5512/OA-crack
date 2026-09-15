import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z, ZodTypeAny } from 'zod';
import { getRepository } from '../db/index.js';
import { verifyAccess } from '../auth.js';
import type { Repository, SessionRecord } from '../db/types.js';

export async function repo(): Promise<Repository> {
  return getRepository();
}

export function bearerUserId(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return verifyAccess(header.slice(7));
}

/** Returns the authenticated user id or sends 401 and returns null. */
export function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
  const userId = bearerUserId(req);
  if (!userId) {
    void reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }
  return userId;
}

export function clientIp(req: FastifyRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.ip ?? 'unknown';
}

export type ParseResult<T extends ZodTypeAny> =
  | { ok: true; data: z.infer<T> }
  | { ok: false; issues: z.infer<ZodTypeAny> };

/** Zod-validates input and short-circuits with 400 + machine-readable issues. */
export function parseInput<T extends ZodTypeAny>(schema: T, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  }
  return { ok: true, data: result.data };
}

export function badRequest(reply: FastifyReply, issues: unknown): FastifyReply {
  return reply.code(400).send({ error: 'Invalid input', issues });
}

export function notFound(reply: FastifyReply, what = 'Resource'): FastifyReply {
  return reply.code(404).send({ error: `${what} not found` });
}

export async function audit(
  repository: Repository,
  userId: string | null,
  action: string,
  resource = '',
  ip?: string,
): Promise<void> {
  await repository.addAuditLog({ userId, action, resource, ipAddress: ip ?? null }).catch(() => undefined);
}

/** Loads a session only when it belongs to the caller (prevents IDOR). */
export async function ownedSession(
  repository: Repository,
  sessionId: string,
  userId: string,
): Promise<SessionRecord | null> {
  const session = await repository.getSession(sessionId);
  if (!session || session.userId !== userId) return null;
  return session;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}