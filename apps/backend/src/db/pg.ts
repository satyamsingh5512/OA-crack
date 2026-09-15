import { and, desc, eq, gte, sql, type InferSelectModel } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  DEFAULT_PRIVACY_SETTINGS, DEFAULT_USER_SETTINGS, EMPTY_JOB_DESCRIPTION, EMPTY_RESUME,
  type InterviewMode, type PrivacySettingsShape, type SessionStatus,
  type UserSettingsShape, type UsageSummary,
  type ParsedResume, type ParsedJobDescription, type QuestionCategory, type Speaker,
  type EvaluationCategory,
} from '@ai-assistant/shared';
import * as t from './schema.js';
import type {
  AiProviderRecord, AiProviderSecretRecord, AnswerRecord, AuditLogRecord, DetectedQuestionInput,
  EvaluationRecord, JobDescriptionRecord, NewAnswer, NewEvaluation, NewTranscript, QuestionRecord,
  QuestionWithAnswer, RefreshTokenRecord, Repository, ResumeRecord, SessionDetail, SessionRecord,
  TranscriptRecord, UsageEventRecord, UserRecord,
} from './types.js';
import { buildUserExport, summarizeUsage } from './aggregate.js';

export type Db = NodePgDatabase<Record<string, never>>;

const isoTs = (v: string | Date | null | undefined): string | null =>
  v == null ? null : (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

export class PgRepository implements Repository {
  readonly driver = 'postgres' as const;
  constructor(private readonly db: Db) {}

  async ping(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);
      return true;
    } catch { return false; }
  }

  /* ------------------------------ users ------------------------------ */
  async createUser(input: { email: string; passwordHash: string }): Promise<UserRecord> {
    const [row] = await this.db.insert(t.users)
      .values({ email: input.email.toLowerCase(), passwordHash: input.passwordHash })
      .returning();
    return mapUser(row);
  }
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(t.users).where(eq(t.users.email, email.toLowerCase())).limit(1);
    return row ? mapUser(row) : null;
  }
  async findUserById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(t.users).where(eq(t.users.id, id)).limit(1);
    return row ? mapUser(row) : null;
  }
  async findPublicUserById(id: string): Promise<{ id: string; email: string; createdAt: string } | null> {
    const [row] = await this.db.select({ id: t.users.id, email: t.users.email, createdAt: t.users.createdAt })
      .from(t.users)
      .where(eq(t.users.id, id))
      .limit(1);
    return row ? { id: row.id, email: row.email, createdAt: isoTs(row.createdAt)! } : null;
  }
  async deleteUser(id: string): Promise<void> {
    await this.db.delete(t.users).where(eq(t.users.id, id));
  }

  /* -------------------------- refresh tokens ------------------------- */
  async saveRefreshToken(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<void> {
    await this.db.insert(t.refreshTokens).values({
      userId: input.userId, tokenHash: input.tokenHash, expiresAt: isoTs(input.expiresAt)!,
    }).onConflictDoUpdate({
      target: t.refreshTokens.tokenHash,
      set: { revokedAt: null, expiresAt: isoTs(input.expiresAt)! },
    });
  }
  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const [row] = await this.db.select().from(t.refreshTokens).where(eq(t.refreshTokens.tokenHash, tokenHash)).limit(1);
    if (!row) return null;
    return { id: row.id, userId: row.userId, tokenHash: row.tokenHash, expiresAt: isoTs(row.expiresAt)!, revokedAt: isoTs(row.revokedAt) };
  }
  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.db.update(t.refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(t.refreshTokens.tokenHash, tokenHash));
  }
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.db.update(t.refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(t.refreshTokens.userId, userId), sql`revoked_at is null`));
  }

  /* ----------------------------- sessions ---------------------------- */
  async createSession(input: { userId: string; mode: InterviewMode; resumeId?: string; jobDescriptionId?: string }): Promise<SessionRecord> {
    const [row] = await this.db.insert(t.sessions).values({
      userId: input.userId,
      mode: input.mode,
      status: 'active',
      resumeId: input.resumeId ?? null,
      jobDescriptionId: input.jobDescriptionId ?? null,
    }).returning();
    return mapSession(row);
  }
  async getSession(id: string): Promise<SessionRecord | null> {
    const [row] = await this.db.select().from(t.sessions).where(eq(t.sessions.id, id)).limit(1);
    return row ? mapSession(row) : null;
  }
  async getActiveSession(userId: string): Promise<SessionRecord | null> {
    const [row] = await this.db.select().from(t.sessions)
      .where(and(eq(t.sessions.userId, userId), eq(t.sessions.status, 'active'))).limit(1);
    return row ? mapSession(row) : null;
  }
  async listSessions(userId: string, opts: { limit: number; offset: number }): Promise<SessionRecord[]> {
    const rows = await this.db.select().from(t.sessions)
      .where(eq(t.sessions.userId, userId))
      .orderBy(desc(t.sessions.startedAt))
      .limit(opts.limit).offset(opts.offset);
    return rows.map(mapSession);
  }
  async listAllSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.db.select().from(t.sessions)
      .where(eq(t.sessions.userId, userId))
      .orderBy(desc(t.sessions.startedAt));
    return rows.map(mapSession);
  }
  async countSessions(userId: string): Promise<number> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(t.sessions).where(eq(t.sessions.userId, userId));
    return row?.n ?? 0;
  }
  async updateSessionStatus(id: string, status: SessionStatus, endedAt?: string | null): Promise<SessionRecord | null> {
    const patch: Record<string, unknown> = { status };
    if (endedAt !== undefined) patch.endedAt = endedAt === null ? null : isoTs(endedAt);
    const [row] = await this.db.update(t.sessions).set(patch).where(eq(t.sessions.id, id)).returning();
    return row ? mapSession(row) : null;
  }
  async setSessionScore(id: string, score: number): Promise<void> {
    await this.db.update(t.sessions).set({ score }).where(eq(t.sessions.id, id));
  }
  async deleteSession(id: string): Promise<void> {
    await this.db.delete(t.sessions).where(eq(t.sessions.id, id));
  }

  /* ---------------------------- transcripts -------------------------- */
  async addTranscript(sessionId: string, input: NewTranscript): Promise<TranscriptRecord> {
    const [row] = await this.db.insert(t.transcripts).values({
      sessionId,
      speaker: input.speaker,
      text: input.text,
      ...(input.timestamp ? { timestamp: isoTs(input.timestamp)! } : {}),
      confidence: input.confidence ?? null,
    }).returning();
    for (const seg of input.segments ?? []) {
      await this.db.insert(t.transcriptSegments).values({
        transcriptId: row.id, startMs: seg.startMs, endMs: seg.endMs, text: seg.text,
      });
    }
    return mapTranscript(row);
  }
  async listTranscripts(sessionId: string): Promise<TranscriptRecord[]> {
    const rows = await this.db.select().from(t.transcripts)
      .where(eq(t.transcripts.sessionId, sessionId))
      .orderBy(t.transcripts.timestamp);
    return rows.map(mapTranscript);
  }
  async countTranscripts(sessionId: string): Promise<number> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` })
      .from(t.transcripts).where(eq(t.transcripts.sessionId, sessionId));
    return row?.n ?? 0;
  }
  async deleteTranscripts(sessionId: string): Promise<number> {
    const rows = await this.db.delete(t.transcripts).where(eq(t.transcripts.sessionId, sessionId)).returning({ id: t.transcripts.id });
    return rows.length;
  }

  /* ----------------------------- questions --------------------------- */
  async addQuestion(sessionId: string, question: DetectedQuestionInput): Promise<QuestionRecord> {
    const [row] = await this.db.insert(t.questions).values({
      sessionId,
      text: question.question,
      category: question.category,
      confidence: question.confidence,
      context: question.context ?? '',
      ...(question.detectedAt ? { detectedAt: isoTs(question.detectedAt)! } : {}),
    }).returning();
    return mapQuestion(row);
  }
  async listQuestions(sessionId: string): Promise<QuestionRecord[]> {
    const rows = await this.db.select().from(t.questions)
      .where(eq(t.questions.sessionId, sessionId))
      .orderBy(t.questions.detectedAt);
    return rows.map(mapQuestion);
  }
  async listQuestionsForUser(userId: string): Promise<QuestionWithAnswer[]> {
    const rows = await this.db.select({ q: t.questions, a: t.answers })
      .from(t.questions)
      .innerJoin(t.sessions, eq(t.questions.sessionId, t.sessions.id))
      .leftJoin(t.answers, eq(t.answers.questionId, t.questions.id))
      .where(eq(t.sessions.userId, userId))
      .orderBy(t.questions.detectedAt);
    return rows.map((r) => ({ ...mapQuestion(r.q), answer: r.a ? mapAnswer(r.a) : null }));
  }

  /* ------------------------------ answers ---------------------------- */
  async upsertAnswer(input: NewAnswer): Promise<AnswerRecord> {
    const [row] = await this.db.insert(t.answers).values({
      questionId: input.questionId,
      text: input.text,
      keyPoints: input.keyPoints,
      latencyMs: input.latencyMs,
      provider: input.provider,
    }).onConflictDoUpdate({
      target: t.answers.questionId,
      set: { text: input.text, keyPoints: input.keyPoints, latencyMs: input.latencyMs, provider: input.provider },
    }).returning();
    return mapAnswer(row);
  }
  async listAnswersForSession(sessionId: string): Promise<AnswerRecord[]> {
    const rows = await this.db.select({ a: t.answers })
      .from(t.answers)
      .innerJoin(t.questions, eq(t.answers.questionId, t.questions.id))
      .where(eq(t.questions.sessionId, sessionId));
    return rows.map((r) => mapAnswer(r.a));
  }

  /* ---------------------------- evaluations -------------------------- */
  async saveEvaluation(input: NewEvaluation): Promise<EvaluationRecord> {
    const [row] = await this.db.insert(t.evaluations).values({
      sessionId: input.sessionId,
      overallScore: input.overallScore,
      categoriesJson: input.categories,
      topImprovements: input.topImprovements,
      nextPractice: input.nextPractice,
    }).onConflictDoUpdate({
      target: t.evaluations.sessionId,
      set: {
        overallScore: input.overallScore,
        categoriesJson: input.categories,
        topImprovements: input.topImprovements,
        nextPractice: input.nextPractice,
      },
    }).returning();
    return mapEvaluation(row);
  }
  async getEvaluation(sessionId: string): Promise<EvaluationRecord | null> {
    const [row] = await this.db.select().from(t.evaluations).where(eq(t.evaluations.sessionId, sessionId)).limit(1);
    return row ? mapEvaluation(row) : null;
  }
  async listEvaluationsForUser(userId: string): Promise<EvaluationRecord[]> {
    const rows = await this.db.select({ e: t.evaluations })
      .from(t.evaluations)
      .innerJoin(t.sessions, eq(t.evaluations.sessionId, t.sessions.id))
      .where(eq(t.sessions.userId, userId));
    return rows.map((r) => mapEvaluation(r.e));
  }
  /* ------------------------- resumes / jobs -------------------------- */
  async createResume(input: { userId: string; filename: string; content: string; parsed: ParsedResume }): Promise<ResumeRecord> {
    const [row] = await this.db.insert(t.resumes).values({
      userId: input.userId, filename: input.filename, content: input.content, parsedJson: input.parsed,
    }).returning();
    return mapResume(row);
  }
  async listResumes(userId: string): Promise<ResumeRecord[]> {
    const rows = await this.db.select().from(t.resumes)
      .where(eq(t.resumes.userId, userId))
      .orderBy(desc(t.resumes.uploadedAt));
    return rows.map(mapResume);
  }
  async getResume(id: string): Promise<ResumeRecord | null> {
    const [row] = await this.db.select().from(t.resumes).where(eq(t.resumes.id, id)).limit(1);
    return row ? mapResume(row) : null;
  }
  async deleteResume(id: string): Promise<void> {
    await this.db.delete(t.resumes).where(eq(t.resumes.id, id));
  }

  async createJobDescription(input: { userId: string; title: string; content: string; parsed: ParsedJobDescription }): Promise<JobDescriptionRecord> {
    const [row] = await this.db.insert(t.jobDescriptions).values({
      userId: input.userId, title: input.title, content: input.content, parsedJson: input.parsed,
    }).returning();
    return mapJobDescription(row);
  }
  async listJobDescriptions(userId: string): Promise<JobDescriptionRecord[]> {
    const rows = await this.db.select().from(t.jobDescriptions)
      .where(eq(t.jobDescriptions.userId, userId))
      .orderBy(desc(t.jobDescriptions.createdAt));
    return rows.map(mapJobDescription);
  }
  async getJobDescription(id: string): Promise<JobDescriptionRecord | null> {
    const [row] = await this.db.select().from(t.jobDescriptions).where(eq(t.jobDescriptions.id, id)).limit(1);
    return row ? mapJobDescription(row) : null;
  }
  async deleteJobDescription(id: string): Promise<void> {
    await this.db.delete(t.jobDescriptions).where(eq(t.jobDescriptions.id, id));
  }

  /* ---------------------------- providers ---------------------------- */
  async upsertProvider(input: { userId: string; provider: string; encryptedApiKey: string; isDefault: boolean; baseUrl?: string | null; model?: string | null }): Promise<AiProviderRecord> {
    if (input.isDefault) {
      await this.db.update(t.aiProviders).set({ isDefault: false }).where(eq(t.aiProviders.userId, input.userId));
    }
    const [row] = await this.db.insert(t.aiProviders).values({
      userId: input.userId, provider: input.provider,
      encryptedApiKey: input.encryptedApiKey, isDefault: input.isDefault,
      baseUrl: input.baseUrl ?? null, model: input.model ?? null,
    }).onConflictDoUpdate({
      target: [t.aiProviders.userId, t.aiProviders.provider],
      set: {
        encryptedApiKey: input.encryptedApiKey,
        isDefault: input.isDefault,
        baseUrl: input.baseUrl ?? null,
        model: input.model ?? null,
      },
    }).returning();
    return mapProvider(row);
  }
  async listProviders(userId: string): Promise<AiProviderRecord[]> {
    const rows = await this.db.select().from(t.aiProviders)
      .where(eq(t.aiProviders.userId, userId))
      .orderBy(t.aiProviders.provider);
    return rows.map(mapProvider);
  }
  async getProvider(userId: string, provider: string): Promise<AiProviderSecretRecord | null> {
    const [row] = await this.db.select().from(t.aiProviders)
      .where(and(eq(t.aiProviders.userId, userId), eq(t.aiProviders.provider, provider))).limit(1);
    return row ? { ...mapProvider(row), encryptedApiKey: row.encryptedApiKey } : null;
  }
  async deleteProvider(userId: string, id: string): Promise<void> {
    await this.db.delete(t.aiProviders).where(and(eq(t.aiProviders.userId, userId), eq(t.aiProviders.id, id)));
  }

  /* ------------------------------ usage ------------------------------ */
  async addUsageEvent(input: { userId: string; eventType: string; metadata?: Record<string, unknown> }): Promise<UsageEventRecord> {
    const [row] = await this.db.insert(t.usageEvents).values({
      userId: input.userId, eventType: input.eventType, metadata: input.metadata ?? {},
    }).returning();
    return mapUsageEvent(row);
  }
  async listUsageEvents(userId: string, opts: { days: number; limit: number }): Promise<UsageEventRecord[]> {
    const since = new Date(Date.now() - opts.days * 86_400_000).toISOString();
    const rows = await this.db.select().from(t.usageEvents)
      .where(and(eq(t.usageEvents.userId, userId), gte(t.usageEvents.createdAt, since)))
      .orderBy(desc(t.usageEvents.createdAt))
      .limit(opts.limit);
    return rows.map(mapUsageEvent);
  }
  async aggregateUsage(userId: string, days: number): Promise<UsageSummary> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = await this.db.select({ eventType: t.usageEvents.eventType, metadata: t.usageEvents.metadata })
      .from(t.usageEvents)
      .where(and(eq(t.usageEvents.userId, userId), gte(t.usageEvents.createdAt, since)));
    return summarizeUsage(rows.map((r) => ({
      eventType: r.eventType,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
    })));
  }

  /* --------------------- settings / privacy / audit ------------------ */
  async getSettings(userId: string): Promise<UserSettingsShape> {
    const [row] = await this.db.select().from(t.userSettings).where(eq(t.userSettings.userId, userId)).limit(1);
    const stored = (row?.settingsJson ?? {}) as Partial<UserSettingsShape>;
    return { ...DEFAULT_USER_SETTINGS, ...stored };
  }
  async updateSettings(userId: string, patch: Partial<UserSettingsShape>): Promise<UserSettingsShape> {
    const next = { ...(await this.getSettings(userId)), ...patch };
    await this.db.insert(t.userSettings)
      .values({ userId, settingsJson: next })
      .onConflictDoUpdate({ target: t.userSettings.userId, set: { settingsJson: next, updatedAt: new Date().toISOString() } });
    return next;
  }
  async getPrivacy(userId: string): Promise<PrivacySettingsShape> {
    const [row] = await this.db.select().from(t.privacySettings).where(eq(t.privacySettings.userId, userId)).limit(1);
    if (!row) return { ...DEFAULT_PRIVACY_SETTINGS };
    return {
      micEnabled: row.micEnabled,
      systemAudioEnabled: row.systemAudioEnabled,
      screenEnabled: row.screenEnabled,
      cloudAi: row.cloudAi,
      cloudTranscription: row.cloudTranscription,
      sessionRecording: row.sessionRecording,
      retentionDays: row.retentionDays,
    };
  }
  async updatePrivacy(userId: string, patch: Partial<PrivacySettingsShape>): Promise<PrivacySettingsShape> {
    const next = { ...(await this.getPrivacy(userId)), ...patch };
    await this.db.insert(t.privacySettings)
      .values({ userId, ...next })
      .onConflictDoUpdate({ target: t.privacySettings.userId, set: { ...next, updatedAt: new Date().toISOString() } });
    return next;
  }

  async addAuditLog(input: { userId: string | null; action: string; resource?: string; ipAddress?: string | null }): Promise<void> {
    await this.db.insert(t.auditLogs).values({
      userId: input.userId, action: input.action,
      resource: input.resource ?? '', ipAddress: input.ipAddress ?? null,
    });
  }
  async listAuditLogs(userId: string, limit: number): Promise<AuditLogRecord[]> {
    const rows = await this.db.select().from(t.auditLogs)
      .where(eq(t.auditLogs.userId, userId))
      .orderBy(desc(t.auditLogs.createdAt))
      .limit(limit);
    return rows.map(mapAuditLog);
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const answers = await this.listAnswersForSession(sessionId);
    const questions = (await this.listQuestions(sessionId)).map((q) => ({
      ...q, answer: answers.find((a) => a.questionId === q.id) ?? null,
    }));
    return {
      session,
      transcripts: await this.listTranscripts(sessionId),
      questions,
      evaluation: await this.getEvaluation(sessionId),
    };
  }

  /* --------------------------- data export --------------------------- */
  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    return buildUserExport(this, userId);
  }
}

/* ------------------------------- mappers ------------------------------- */
type UserRow = InferSelectModel<typeof t.users>;
type SessionRow = InferSelectModel<typeof t.sessions>;
type TranscriptRow = InferSelectModel<typeof t.transcripts>;
type QuestionRow = InferSelectModel<typeof t.questions>;
type AnswerRow = InferSelectModel<typeof t.answers>;
type EvaluationRow = InferSelectModel<typeof t.evaluations>;
type ResumeRow = InferSelectModel<typeof t.resumes>;
type JobDescriptionRow = InferSelectModel<typeof t.jobDescriptions>;
type ProviderRow = InferSelectModel<typeof t.aiProviders>;
type UsageEventRow = InferSelectModel<typeof t.usageEvents>;
type AuditLogRow = InferSelectModel<typeof t.auditLogs>;

function mapUser(r: UserRow): UserRecord {
  return { id: r.id, email: r.email, passwordHash: r.passwordHash, createdAt: isoTs(r.createdAt)!, updatedAt: isoTs(r.updatedAt)! };
}
function mapSession(r: SessionRow): SessionRecord {
  return {
    id: r.id, userId: r.userId, mode: r.mode as InterviewMode, status: r.status as SessionStatus,
    startedAt: isoTs(r.startedAt)!, endedAt: isoTs(r.endedAt), score: r.score,
    resumeId: r.resumeId, jobDescriptionId: r.jobDescriptionId,
  };
}
function mapTranscript(r: TranscriptRow): TranscriptRecord {
  return {
    id: r.id, sessionId: r.sessionId, speaker: r.speaker as Speaker, text: r.text,
    timestamp: isoTs(r.timestamp)!, confidence: r.confidence,
  };
}
function mapQuestion(r: QuestionRow): QuestionRecord {
  return {
    id: r.id, sessionId: r.sessionId, text: r.text, category: r.category as QuestionCategory,
    confidence: r.confidence, context: r.context, detectedAt: isoTs(r.detectedAt)!,
  };
}
function mapAnswer(r: AnswerRow): AnswerRecord {
  return {
    id: r.id, questionId: r.questionId, text: r.text, keyPoints: r.keyPoints ?? [],
    latencyMs: r.latencyMs, provider: r.provider, createdAt: isoTs(r.createdAt)!,
  };
}
function mapEvaluation(r: EvaluationRow): EvaluationRecord {
  return {
    id: r.id, sessionId: r.sessionId, overallScore: r.overallScore,
    categories: (r.categoriesJson ?? {}) as Record<string, EvaluationCategory>,
    topImprovements: r.topImprovements ?? [], nextPractice: r.nextPractice, createdAt: isoTs(r.createdAt)!,
  };
}
function mapResume(r: ResumeRow): ResumeRecord {
  return {
    id: r.id, userId: r.userId, filename: r.filename, content: r.content,
    parsed: (r.parsedJson ?? EMPTY_RESUME) as ParsedResume, uploadedAt: isoTs(r.uploadedAt)!,
  };
}
function mapJobDescription(r: JobDescriptionRow): JobDescriptionRecord {
  return {
    id: r.id, userId: r.userId, title: r.title, content: r.content,
    parsed: (r.parsedJson ?? EMPTY_JOB_DESCRIPTION) as ParsedJobDescription, createdAt: isoTs(r.createdAt)!,
  };
}
function mapProvider(r: ProviderRow): AiProviderRecord {
  return {
    id: r.id, userId: r.userId, provider: r.provider, baseUrl: r.baseUrl, model: r.model,
    isDefault: r.isDefault, createdAt: isoTs(r.createdAt)!,
  };
}
function mapUsageEvent(r: UsageEventRow): UsageEventRecord {
  return { id: r.id, userId: r.userId, eventType: r.eventType, metadata: (r.metadata ?? {}) as Record<string, unknown>, createdAt: isoTs(r.createdAt)! };
}
function mapAuditLog(r: AuditLogRow): AuditLogRecord {
  return { id: r.id, userId: r.userId, action: r.action, resource: r.resource, ipAddress: r.ipAddress, createdAt: isoTs(r.createdAt)! };
}