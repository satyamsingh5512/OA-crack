import type { FastifyInstance } from 'fastify';
import { paginationSchema, usageQuerySchema } from '@ai-assistant/shared';
import { getRepository } from '../db/index.js';
import { serverMetrics } from '../observability/metrics.js';
import { computeDashboardMetrics } from '../services/metrics.js';
import { getWsConnectionCount } from '../ws/server.js';
import { audit, badRequest, clientIp, parseInput, repo, requireUser } from '../http/helpers.js';

export async function registerAccountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/account/export', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const data = await db.exportUserData(userId);
    await audit(db, userId, 'account.export', 'account', clientIp(req));
    reply.header('Content-Disposition', 'attachment; filename="ai-interview-assistant-export.json"');
    return data;
  });

  app.delete('/account', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    await db.revokeAllRefreshTokens(userId);
    await db.deleteUser(userId);
    return { ok: true };
  });

  app.get('/account/audit-logs', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(paginationSchema, req.query ?? {});
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    return { auditLogs: await db.listAuditLogs(userId, parsed.data.limit) };
  });

  app.get('/usage', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(usageQuerySchema, req.query ?? {});
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    return {
      summary: await db.aggregateUsage(userId, parsed.data.days),
      events: await db.listUsageEvents(userId, { days: parsed.data.days, limit: 100 }),
    };
  });

  app.post('/usage/transcription', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const body = (req.body ?? {}) as { seconds?: number; provider?: string };
    if (typeof body.seconds !== 'number' || body.seconds <= 0 || body.seconds > 36000) {
      return reply.code(400).send({ error: 'seconds must be a positive number of seconds (max 10h)' });
    }
    const db = await repo();
    serverMetrics.recordTranscription(body.seconds);
    await db.addUsageEvent({
      userId,
      eventType: 'transcription.audio',
      metadata: { seconds: body.seconds, provider: body.provider ?? 'desktop' },
    });
    return { ok: true };
  });

  app.get('/metrics', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await getRepository();
    return serverMetrics.snapshot({
      dbHealthy: await db.ping().catch(() => false),
      dbDriver: db.driver,
    });
  });

  app.get('/metrics/dashboard', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const [sessions, questions, evaluations] = await Promise.all([
      db.listAllSessions(userId),
      db.listQuestionsForUser(userId),
      db.listEvaluationsForUser(userId),
    ]);
    return computeDashboardMetrics({
      sessions,
      questions: questions.map((q) => ({
        category: q.category,
        detectedAt: q.detectedAt,
        latencyMs: q.answer?.latencyMs ?? null,
      })),
      evaluations,
    });
  });

  app.get('/ws/info', async () => {
    // Cheap discovery for desktop/web clients; the WS server authenticates separately.
    return { connections: getWsConnectionCount() };
  });
}