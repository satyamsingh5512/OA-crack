import type { FastifyInstance } from 'fastify';
import {
  appendAnswerSchema, appendQuestionSchema, appendTranscriptSchema, createSessionSchema, paginationSchema,
} from '@ai-assistant/shared';
import type { Repository } from '../db/types.js';
import { evaluateStoredSession, type EvaluationResult } from '../services/evaluation.js';
import {
  audit, badRequest, clientIp, notFound, ownedSession, parseInput, repo, requireUser,
} from '../http/helpers.js';

/** Runs the §11 report for a session and stores it (used by end + explicit evaluate). */
export async function generateEvaluation(db: Repository, sessionId: string): Promise<EvaluationResult | null> {
  const session = await db.getSession(sessionId);
  if (!session) return null;
  const [transcripts, questions, answers] = await Promise.all([
    db.listTranscripts(sessionId),
    db.listQuestions(sessionId),
    db.listAnswersForSession(sessionId),
  ]);
  const result = evaluateStoredSession({
    mode: session.mode,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    transcripts,
    questions,
    answers,
  });
  await db.saveEvaluation({
    sessionId,
    overallScore: result.overallScore,
    categories: result.categories,
    topImprovements: result.topImprovements,
    nextPractice: result.nextPractice,
  });
  await db.setSessionScore(sessionId, result.overallScore);
  return result;
}

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/sessions', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(createSessionSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);

    const db = await repo();
    // One active session per user (§18 concurrent-session prevention).
    const active = await db.getActiveSession(userId);
    if (active) return reply.code(409).send({ error: 'A session is already active', sessionId: active.id });

    const context: Record<string, string> = {};
    if (parsed.data.resumeId) {
      const resume = await db.getResume(parsed.data.resumeId);
      if (!resume || resume.userId !== userId) return notFound(reply, 'Resume');
      context.resumeContext = resume.content.slice(0, 8000);
    }
    if (parsed.data.jobDescriptionId) {
      const jd = await db.getJobDescription(parsed.data.jobDescriptionId);
      if (!jd || jd.userId !== userId) return notFound(reply, 'Job description');
      context.jobDescription = jd.content.slice(0, 8000);
    }

    const session = await db.createSession({
      userId,
      mode: parsed.data.mode,
      resumeId: parsed.data.resumeId,
      jobDescriptionId: parsed.data.jobDescriptionId,
    });
    await db.addUsageEvent({ userId, eventType: 'session.started', metadata: { mode: session.mode } });
    await audit(db, userId, 'session.start', session.id, clientIp(req));
    return { session, context };
  });

  app.get('/sessions', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(paginationSchema, req.query ?? {});
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const sessions = await db.listSessions(userId, parsed.data);
    const enriched = await Promise.all(sessions.map(async (session) => {
      const [questions, evaluation] = await Promise.all([
        db.listQuestions(session.id),
        db.getEvaluation(session.id),
      ]);
      return { ...session, questionCount: questions.length, score: evaluation?.overallScore ?? session.score };
    }));
    return { sessions: enriched, total: await db.countSessions(userId), ...parsed.data };
  });

  app.get('/sessions/:id', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const detail = await db.getSessionDetail((req.params as { id: string }).id);
    if (!detail || detail.session.userId !== userId) return notFound(reply, 'Session');
    return detail;
  });

  app.post('/sessions/:id/pause', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    if (session.status === 'ended') return reply.code(409).send({ error: 'Session already ended' });
    const updated = await db.updateSessionStatus(id, 'paused');
    await audit(db, userId, 'session.pause', id, clientIp(req));
    return { session: updated };
  });

  app.post('/sessions/:id/resume', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    if (session.status === 'ended') return reply.code(409).send({ error: 'Session already ended' });
    const updated = await db.updateSessionStatus(id, 'active', null);
    await audit(db, userId, 'session.resume', id, clientIp(req));
    return { session: updated };
  });

  app.post('/sessions/:id/end', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    const endedAt = new Date().toISOString();
    const updated = await db.updateSessionStatus(id, 'ended', endedAt);
    // §11: every session gets a report. Re-ending returns the existing one.
    const evaluation = session.status === 'ended' ? await db.getEvaluation(id) : await generateEvaluation(db, id);
    await db.addUsageEvent({
      userId,
      eventType: 'session.ended',
      metadata: { mode: session.mode, durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(session.startedAt)) },
    });
    await audit(db, userId, 'session.end', id, clientIp(req));
    return { session: updated, evaluation };
  });

  app.delete('/sessions/:id', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    await db.deleteSession(id);
    await audit(db, userId, 'session.delete', id, clientIp(req));
    return { ok: true };
  });

  app.delete('/sessions/:id/transcript', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    const deleted = await db.deleteTranscripts(id);
    await audit(db, userId, 'session.transcript.delete', id, clientIp(req));
    return { ok: true, deleted };
  });

  /* ---------------- live pipeline ingestion (desktop → backend) ---------------- */

  app.post('/sessions/:id/transcripts', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(appendTranscriptSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    if (session.status === 'ended') return reply.code(409).send({ error: 'Session already ended' });
    const transcript = await db.addTranscript(id, parsed.data);
    return { transcript };
  });

  app.post('/sessions/:id/questions', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(appendQuestionSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    const question = await db.addQuestion(id, {
      question: parsed.data.text,
      category: parsed.data.category,
      confidence: parsed.data.confidence,
      context: parsed.data.context ?? '',
      detectedAt: parsed.data.detectedAt ?? new Date().toISOString(),
    });
    await db.addUsageEvent({ userId, eventType: 'question.detected', metadata: { category: question.category } });
    return { question };
  });

  app.post('/sessions/:id/answers', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(appendAnswerSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    const questions = await db.listQuestions(id);
    if (!questions.some((q) => q.id === parsed.data.questionId)) return notFound(reply, 'Question');
    const answer = await db.upsertAnswer(parsed.data);
    return { answer };
  });

  app.get('/sessions/:id/transcript', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    const transcripts = await db.listTranscripts(id);
    return { transcripts, text: transcripts.map((t) => `${t.speaker}: ${t.text}`).join('\n') };
  });

  app.get('/sessions/:id/evaluation', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    return { evaluation: await db.getEvaluation(id) };
  });

  app.post('/sessions/:id/evaluate', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    const session = await ownedSession(db, id, userId);
    if (!session) return notFound(reply, 'Session');
    const evaluation = await generateEvaluation(db, id);
    if (!evaluation) return notFound(reply, 'Session');
    await audit(db, userId, 'session.evaluate', id, clientIp(req));
    return { evaluation };
  });
}