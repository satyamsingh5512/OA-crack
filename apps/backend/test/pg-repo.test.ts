import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgRepository, type Db } from '../src/db/pg.js';
import { EMPTY_JOB_DESCRIPTION, EMPTY_RESUME } from '@ai-assistant/shared';

/**
 * Runs the full repository surface against a real PostgreSQL.
 * Execute with: RUN_DB_TESTS=1 TEST_DATABASE_URL=postgresql://... npm test -w apps/backend
 * CI runs this against a fresh `postgres:16` service after `npm run migrate`.
 */
const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const enabled = process.env.RUN_DB_TESTS === '1' && Boolean(connectionString);

(enabled ? describe : describe.skip)('PostgreSQL repository', () => {
  let pool: Pool;
  let repo: PgRepository;
  let userId = '';

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    repo = new PgRepository(drizzle(pool) as unknown as Db);
    expect(await repo.ping()).toBe(true);
  });

  afterAll(async () => {
    if (userId) await repo.deleteUser(userId).catch(() => undefined);
    await pool?.end();
  });

  it('creates and finds users', async () => {
    const email = `pg${Date.now()}@example.com`;
    const user = await repo.createUser({ email, passwordHash: 'argon2:stub' });
    userId = user.id;
    expect(await repo.findUserByEmail(email.toUpperCase())).toMatchObject({ id: user.id });
    expect(await repo.findUserById(user.id)).toMatchObject({ email: email.toLowerCase() });
  });

  it('manages refresh tokens hashed server-side', async () => {
    await repo.saveRefreshToken({ userId, tokenHash: 'hash-1', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    expect(await repo.findRefreshToken('hash-1')).toMatchObject({ userId });
    await repo.revokeRefreshToken('hash-1');
    expect((await repo.findRefreshToken('hash-1'))?.revokedAt).not.toBeNull();
    await repo.saveRefreshToken({ userId, tokenHash: 'hash-2', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    await repo.revokeAllRefreshTokens(userId);
    expect((await repo.findRefreshToken('hash-2'))?.revokedAt).not.toBeNull();
  });

  it('drives sessions through their lifecycle', async () => {
    const session = await repo.createSession({ userId, mode: 'coding' });
    expect(session.status).toBe('active');
    expect(await repo.getActiveSession(userId)).toMatchObject({ id: session.id });
    // Partial unique index: inserting a second active session must fail at the DB level.
    await expect(repo.createSession({ userId, mode: 'mock' })).rejects.toThrow();
    expect(await repo.countSessions(userId)).toBe(1);
    await repo.updateSessionStatus(session.id, 'paused');
    await repo.updateSessionStatus(session.id, 'ended', new Date().toISOString());
    const ended = await repo.getSession(session.id);
    expect(ended?.status).toBe('ended');
    expect(ended?.endedAt).not.toBeNull();
  });

  let sessionId = '';
  it('stores transcripts, questions and answers with joins', async () => {
    const session = await repo.createSession({ userId, mode: 'behavioral' });
    sessionId = session.id;
    const line = await repo.addTranscript(sessionId, {
      speaker: 'candidate',
      text: 'I built the notification platform.',
      confidence: 0.97,
      segments: [{ startMs: 0, endMs: 1200, text: 'I built the notification platform.' }],
    });
    expect(line.confidence).toBeCloseTo(0.97);
    expect(await repo.countTranscripts(sessionId)).toBe(1);

    const question = await repo.addQuestion(sessionId, {
      question: 'Tell me about a hard project?',
      category: 'project',
      confidence: 0.8,
      detectedAt: new Date().toISOString(),
      context: 'opening',
    });
    const answer = await repo.upsertAnswer({
      questionId: question.id, text: 'We shipped it.', keyPoints: ['owned it'], latencyMs: 1500, provider: 'template-local',
    });
    expect(answer.provider).toBe('template-local');

    const forUser = await repo.listQuestionsForUser(userId);
    expect(forUser.find((q) => q.id === question.id)?.answer?.text).toBe('We shipped it.');
    expect((await repo.listAnswersForSession(sessionId))).toHaveLength(1);
    expect((await repo.getSessionDetail(sessionId))?.transcripts).toHaveLength(1);
    expect(await repo.deleteTranscripts(sessionId)).toBe(1);
    expect(await repo.countTranscripts(sessionId)).toBe(0);
    await repo.updateSessionStatus(sessionId, 'ended', new Date().toISOString());
  });

  it('saves evaluations, resumes, JDs, providers, usage, settings and privacy', async () => {
    const session = await repo.createSession({ userId, mode: 'technical' });
    const evaluation = await repo.saveEvaluation({
      sessionId: session.id,
      overallScore: 77.5,
      categories: { communication: { score: 80, strengths: ['a'], weaknesses: [], recommendations: [] } },
      topImprovements: ['Speak up'],
      nextPractice: 'Practice more',
    });
    expect(evaluation.overallScore).toBe(77.5);
    expect(await repo.getEvaluation(session.id)).toMatchObject({ overallScore: 77.5 });
    expect(await repo.listEvaluationsForUser(userId)).toHaveLength(1);

    const resume = await repo.createResume({ userId, filename: 'r.txt', content: 'TypeScript', parsed: { ...EMPTY_RESUME, skills: ['TypeScript'] } });
    expect(await repo.getResume(resume.id)).toMatchObject({ filename: 'r.txt' });
    expect(await repo.listResumes(userId)).toHaveLength(1);
    await repo.deleteResume(resume.id);
    expect(await repo.getResume(resume.id)).toBeNull();

    const jd = await repo.createJobDescription({ userId, title: 'Backend', content: 'Build things', parsed: { ...EMPTY_JOB_DESCRIPTION, title: 'Backend' } });
    expect((await repo.listJobDescriptions(userId))).toHaveLength(1);
    await repo.deleteJobDescription(jd.id);

    const stored = await repo.upsertProvider({
      userId, provider: 'openai', encryptedApiKey: 'v1:a:b:c', isDefault: true, baseUrl: null, model: 'gpt-4o-mini',
    });
    expect(stored.model).toBe('gpt-4o-mini');
    expect((await repo.listProviders(userId))).toHaveLength(1);
    expect((await repo.getProvider(userId, 'openai'))?.encryptedApiKey).toBe('v1:a:b:c');
    await repo.deleteProvider(userId, stored.id);

    await repo.addUsageEvent({ userId, eventType: 'ai.request', metadata: { tokens: 50, provider: 'openai' } });
    await repo.addUsageEvent({ userId, eventType: 'transcription.audio', metadata: { seconds: 120 } });
    const summary = await repo.aggregateUsage(userId, 30);
    expect(summary.aiTokens).toBe(50);
    expect(summary.transcriptionMinutes).toBe(2);

    const settings = await repo.updateSettings(userId, { answerMode: 'star', fontScale: 1.2 });
    expect(settings.answerMode).toBe('star');
    expect((await repo.getSettings(userId)).fontScale).toBeCloseTo(1.2);
    const privacy = await repo.updatePrivacy(userId, { cloudAi: false });
    expect(privacy.cloudAi).toBe(false);

    await repo.addAuditLog({ userId, action: 'test.action', resource: 'x', ipAddress: '127.0.0.1' });
    expect((await repo.listAuditLogs(userId, 5)).length).toBeGreaterThan(0);

    const exported = await repo.exportUserData(userId);
    expect(exported).toHaveProperty('sessions');
    expect(JSON.stringify(exported)).not.toContain('argon2:stub');
    expect(JSON.stringify(exported)).not.toContain('v1:a:b:c');

    await repo.deleteSession(session.id);
    expect(await repo.getSession(session.id)).toBeNull();
  });
});