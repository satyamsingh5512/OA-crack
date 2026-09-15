import { randomUUID } from 'node:crypto';
import {
  DEFAULT_PRIVACY_SETTINGS, DEFAULT_USER_SETTINGS,
  type InterviewMode, type PrivacySettingsShape, type SessionStatus,
  type UserSettingsShape, type UsageSummary,
} from '@ai-assistant/shared';
import type {
  AiProviderSecretRecord, AnswerRecord, AuditLogRecord, DetectedQuestionInput,
  EvaluationRecord, JobDescriptionRecord, NewAnswer, NewEvaluation, NewTranscript, QuestionRecord,
  QuestionWithAnswer, RefreshTokenRecord, Repository, ResumeRecord, SessionDetail, SessionRecord,
  TranscriptRecord, TranscriptSegmentRecord, UsageEventRecord, UserRecord,
} from './types.js';
import { buildUserExport, summarizeUsageFromRecords } from './aggregate.js';

/** The exportable subset of a user row — password hashes never leave the store. */
function toPublicUser(user: UserRecord): { id: string; email: string; createdAt: string } {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

const iso = (d: Date | string): string => new Date(d).toISOString();
const DAY_MS = 86_400_000;

/** Process-local repository. Used by tests and when PostgreSQL is unreachable (§16). */
export class MemoryRepository implements Repository {
  readonly driver = 'memory' as const;

  private users = new Map<string, UserRecord>();
  private emailIndex = new Map<string, string>();
  private refreshTokens = new Map<string, RefreshTokenRecord>();
  private sessions = new Map<string, SessionRecord>();
  private transcripts = new Map<string, TranscriptRecord>();
  private segments = new Map<string, TranscriptSegmentRecord>();
  private questions = new Map<string, QuestionRecord>();
  private answers = new Map<string, AnswerRecord>();
  private evaluations = new Map<string, EvaluationRecord>();
  private resumes = new Map<string, ResumeRecord>();
  private jds = new Map<string, JobDescriptionRecord>();
  private providers = new Map<string, AiProviderSecretRecord>();
  private usage = new Map<string, UsageEventRecord>();
  private settings = new Map<string, UserSettingsShape>();
  private privacy = new Map<string, PrivacySettingsShape>();
  private audit = new Map<string, AuditLogRecord>();

  async ping(): Promise<boolean> { return true; }

  /* ------------------------------ users ------------------------------ */
  async createUser(input: { email: string; passwordHash: string }): Promise<UserRecord> {
    const now = iso(new Date());
    const user: UserRecord = {
      id: randomUUID(), email: input.email.toLowerCase(), passwordHash: input.passwordHash,
      createdAt: now, updatedAt: now,
    };
    this.users.set(user.id, user);
    this.emailIndex.set(user.email, user.id);
    return user;
  }
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const id = this.emailIndex.get(email.toLowerCase());
    return id ? this.users.get(id) ?? null : null;
  }
  async findUserById(id: string): Promise<UserRecord | null> { return this.users.get(id) ?? null; }
  async findPublicUserById(id: string): Promise<{ id: string; email: string; createdAt: string } | null> {
    const user = this.users.get(id);
    return user ? toPublicUser(user) : null;
  }

  async deleteUser(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) this.emailIndex.delete(user.email);
    this.users.delete(id);
    this.settings.delete(id);
    this.privacy.delete(id);
    for (const [token, rec] of [...this.refreshTokens]) if (rec.userId === id) this.refreshTokens.delete(token);
    for (const session of await this.listAllSessions(id)) await this.deleteSession(session.id);
    for (const [rid, r] of [...this.resumes]) if (r.userId === id) this.resumes.delete(rid);
    for (const [jid, j] of [...this.jds]) if (j.userId === id) this.jds.delete(jid);
    for (const [pid, p] of [...this.providers]) if (p.userId === id) this.providers.delete(pid);
    for (const [uid, u] of [...this.usage]) if (u.userId === id) this.usage.delete(uid);
    for (const [aid, a] of [...this.audit]) if (a.userId === id) this.audit.delete(aid);
  }

  /* -------------------------- refresh tokens ------------------------- */
  async saveRefreshToken(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<void> {
    this.refreshTokens.set(input.tokenHash, {
      id: randomUUID(), userId: input.userId, tokenHash: input.tokenHash,
      expiresAt: iso(input.expiresAt), revokedAt: null,
    });
  }
  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.refreshTokens.get(tokenHash) ?? null;
  }
  async revokeRefreshToken(tokenHash: string): Promise<void> {
    const rec = this.refreshTokens.get(tokenHash);
    if (rec) this.refreshTokens.set(tokenHash, { ...rec, revokedAt: iso(new Date()) });
  }
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    for (const [token, rec] of [...this.refreshTokens]) {
      if (rec.userId === userId) this.refreshTokens.set(token, { ...rec, revokedAt: iso(new Date()) });
    }
  }

  /* ----------------------------- sessions ---------------------------- */
  async createSession(input: { userId: string; mode: InterviewMode; resumeId?: string; jobDescriptionId?: string }): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: randomUUID(), userId: input.userId, mode: input.mode, status: 'active',
      startedAt: iso(new Date()), endedAt: null, score: null,
      resumeId: input.resumeId ?? null, jobDescriptionId: input.jobDescriptionId ?? null,
    };
    this.sessions.set(session.id, session);
    return session;
  }
  async getSession(id: string): Promise<SessionRecord | null> { return this.sessions.get(id) ?? null; }
  async getActiveSession(userId: string): Promise<SessionRecord | null> {
    for (const s of this.sessions.values()) if (s.userId === userId && s.status === 'active') return s;
    return null;
  }
  async listSessions(userId: string, opts: { limit: number; offset: number }): Promise<SessionRecord[]> {
    return (await this.listAllSessions(userId)).slice(opts.offset, opts.offset + opts.limit);
  }
  async listAllSessions(userId: string): Promise<SessionRecord[]> {
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  async countSessions(userId: string): Promise<number> { return (await this.listAllSessions(userId)).length; }
  async updateSessionStatus(id: string, status: SessionStatus, endedAt?: string | null): Promise<SessionRecord | null> {
    const s = this.sessions.get(id);
    if (!s) return null;
    const next: SessionRecord = {
      ...s, status,
      endedAt: endedAt === undefined ? s.endedAt : endedAt === null ? null : iso(endedAt),
    };
    this.sessions.set(id, next);
    return next;
  }
  async setSessionScore(id: string, score: number): Promise<void> {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, score });
  }
  async deleteSession(id: string): Promise<void> {
    for (const t of await this.listTranscripts(id)) {
      for (const [sid, seg] of [...this.segments]) if (seg.transcriptId === t.id) this.segments.delete(sid);
      this.transcripts.delete(t.id);
    }
    for (const q of await this.listQuestions(id)) {
      for (const [aid, a] of [...this.answers]) if (a.questionId === q.id) this.answers.delete(aid);
      this.questions.delete(q.id);
    }
    this.evaluations.delete(id);
    this.sessions.delete(id);
  }

  /* ---------------------------- transcripts -------------------------- */
  async addTranscript(sessionId: string, input: NewTranscript): Promise<TranscriptRecord> {
    const rec: TranscriptRecord = {
      id: randomUUID(), sessionId, speaker: input.speaker, text: input.text,
      timestamp: input.timestamp ? iso(input.timestamp) : iso(new Date()),
      confidence: input.confidence ?? null,
    };
    this.transcripts.set(rec.id, rec);
    for (const seg of input.segments ?? []) {
      const s: TranscriptSegmentRecord = {
        id: randomUUID(), transcriptId: rec.id, startMs: seg.startMs, endMs: seg.endMs, text: seg.text,
      };
      this.segments.set(s.id, s);
    }
    return rec;
  }
  async listTranscripts(sessionId: string): Promise<TranscriptRecord[]> {
    return [...this.transcripts.values()]
      .filter((t) => t.sessionId === sessionId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  async countTranscripts(sessionId: string): Promise<number> { return (await this.listTranscripts(sessionId)).length; }
  async deleteTranscripts(sessionId: string): Promise<number> {
    const found = await this.listTranscripts(sessionId);
    for (const t of found) {
      for (const [sid, seg] of [...this.segments]) if (seg.transcriptId === t.id) this.segments.delete(sid);
      this.transcripts.delete(t.id);
    }
    return found.length;
  }

  /* ----------------------------- questions --------------------------- */
  async addQuestion(sessionId: string, question: DetectedQuestionInput): Promise<QuestionRecord> {
    const rec: QuestionRecord = {
      id: randomUUID(), sessionId, text: question.question, category: question.category,
      confidence: question.confidence, context: question.context ?? '',
      detectedAt: question.detectedAt ? iso(question.detectedAt) : iso(new Date()),
    };
    this.questions.set(rec.id, rec);
    return rec;
  }
  async listQuestions(sessionId: string): Promise<QuestionRecord[]> {
    return [...this.questions.values()]
      .filter((q) => q.sessionId === sessionId)
      .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
  }
  async listQuestionsForUser(userId: string): Promise<QuestionWithAnswer[]> {
    const sessionIds = new Set((await this.listAllSessions(userId)).map((s) => s.id));
    return [...this.questions.values()]
      .filter((q) => sessionIds.has(q.sessionId))
      .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt))
      .map((q) => ({ ...q, answer: [...this.answers.values()].find((a) => a.questionId === q.id) ?? null }));
  }

  /* ------------------------------ answers ---------------------------- */
  async upsertAnswer(input: NewAnswer): Promise<AnswerRecord> {
    const existing = [...this.answers.values()].find((a) => a.questionId === input.questionId);
    const rec: AnswerRecord = {
      id: existing?.id ?? randomUUID(), questionId: input.questionId, text: input.text,
      keyPoints: input.keyPoints, latencyMs: input.latencyMs, provider: input.provider,
      createdAt: existing?.createdAt ?? iso(new Date()),
    };
    this.answers.set(rec.id, rec);
    return rec;
  }
  async listAnswersForSession(sessionId: string): Promise<AnswerRecord[]> {
    const questionIds = new Set((await this.listQuestions(sessionId)).map((q) => q.id));
    return [...this.answers.values()].filter((a) => questionIds.has(a.questionId));
  }

  /* ---------------------------- evaluations -------------------------- */
  async saveEvaluation(input: NewEvaluation): Promise<EvaluationRecord> {
    const rec: EvaluationRecord = {
      id: this.evaluations.get(input.sessionId)?.id ?? randomUUID(),
      sessionId: input.sessionId,
      overallScore: input.overallScore,
      categories: input.categories,
      topImprovements: input.topImprovements,
      nextPractice: input.nextPractice,
      createdAt: iso(new Date()),
    };
    this.evaluations.set(input.sessionId, rec);
    return rec;
  }
  async getEvaluation(sessionId: string): Promise<EvaluationRecord | null> {
    return this.evaluations.get(sessionId) ?? null;
  }
  async listEvaluationsForUser(userId: string): Promise<EvaluationRecord[]> {
    const sessionIds = new Set((await this.listAllSessions(userId)).map((s) => s.id));
    return [...this.evaluations.values()].filter((e) => sessionIds.has(e.sessionId));
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

  /* ------------------------- resumes / jobs -------------------------- */
  async createResume(input: { userId: string; filename: string; content: string; parsed: ResumeRecord['parsed'] }): Promise<ResumeRecord> {
    const rec: ResumeRecord = {
      id: randomUUID(), userId: input.userId, filename: input.filename,
      content: input.content, parsed: input.parsed, uploadedAt: iso(new Date()),
    };
    this.resumes.set(rec.id, rec);
    return rec;
  }
  async listResumes(userId: string): Promise<ResumeRecord[]> {
    return [...this.resumes.values()].filter((r) => r.userId === userId).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }
  async getResume(id: string): Promise<ResumeRecord | null> { return this.resumes.get(id) ?? null; }
  async deleteResume(id: string): Promise<void> { this.resumes.delete(id); }

  async createJobDescription(input: { userId: string; title: string; content: string; parsed: JobDescriptionRecord['parsed'] }): Promise<JobDescriptionRecord> {
    const rec: JobDescriptionRecord = {
      id: randomUUID(), userId: input.userId, title: input.title, content: input.content,
      parsed: input.parsed, createdAt: iso(new Date()),
    };
    this.jds.set(rec.id, rec);
    return rec;
  }
  async listJobDescriptions(userId: string): Promise<JobDescriptionRecord[]> {
    return [...this.jds.values()].filter((j) => j.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getJobDescription(id: string): Promise<JobDescriptionRecord | null> { return this.jds.get(id) ?? null; }
  async deleteJobDescription(id: string): Promise<void> { this.jds.delete(id); }

  /* ---------------------------- providers ---------------------------- */
  async upsertProvider(input: { userId: string; provider: string; encryptedApiKey: string; isDefault: boolean; baseUrl?: string | null; model?: string | null }): Promise<AiProviderSecretRecord> {
    const existing = [...this.providers.values()].find((p) => p.userId === input.userId && p.provider === input.provider);
    const rec: AiProviderSecretRecord = {
      id: existing?.id ?? randomUUID(), userId: input.userId, provider: input.provider,
      encryptedApiKey: input.encryptedApiKey, isDefault: input.isDefault,
      baseUrl: input.baseUrl ?? existing?.baseUrl ?? null,
      model: input.model ?? existing?.model ?? null,
      createdAt: existing?.createdAt ?? iso(new Date()),
    };
    if (input.isDefault) {
      for (const [id, p] of [...this.providers]) {
        if (p.userId === input.userId && id !== rec.id) this.providers.set(id, { ...p, isDefault: false });
      }
    }
    this.providers.set(rec.id, rec);
    return rec;
  }
  async listProviders(userId: string): Promise<AiProviderSecretRecord[]> {
    return [...this.providers.values()].filter((p) => p.userId === userId).sort((a, b) => a.provider.localeCompare(b.provider));
  }
  async getProvider(userId: string, provider: string): Promise<AiProviderSecretRecord | null> {
    return [...this.providers.values()].find((p) => p.userId === userId && p.provider === provider) ?? null;
  }
  async deleteProvider(userId: string, id: string): Promise<void> {
    const p = this.providers.get(id);
    if (p?.userId === userId) this.providers.delete(id);
  }

  /* ------------------------------ usage ------------------------------ */
  async addUsageEvent(input: { userId: string; eventType: string; metadata?: Record<string, unknown> }): Promise<UsageEventRecord> {
    const rec: UsageEventRecord = {
      id: randomUUID(), userId: input.userId, eventType: input.eventType,
      metadata: input.metadata ?? {}, createdAt: iso(new Date()),
    };
    this.usage.set(rec.id, rec);
    return rec;
  }
  async listUsageEvents(userId: string, opts: { days: number; limit: number }): Promise<UsageEventRecord[]> {
    const since = Date.now() - opts.days * DAY_MS;
    return [...this.usage.values()]
      .filter((e) => e.userId === userId && Date.parse(e.createdAt) >= since)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, opts.limit);
  }
  async aggregateUsage(userId: string, days: number): Promise<UsageSummary> {
    const events = await this.listUsageEvents(userId, { days, limit: 100_000 });
    return summarizeUsageFromRecords(events);
  }

  /* --------------------- settings / privacy / audit ------------------ */
  async getSettings(userId: string): Promise<UserSettingsShape> {
    return { ...DEFAULT_USER_SETTINGS, ...(this.settings.get(userId) ?? {}) };
  }
  async updateSettings(userId: string, patch: Partial<UserSettingsShape>): Promise<UserSettingsShape> {
    const next = { ...(await this.getSettings(userId)), ...patch };
    this.settings.set(userId, next);
    return next;
  }
  async getPrivacy(userId: string): Promise<PrivacySettingsShape> {
    return { ...DEFAULT_PRIVACY_SETTINGS, ...(this.privacy.get(userId) ?? {}) };
  }
  async updatePrivacy(userId: string, patch: Partial<PrivacySettingsShape>): Promise<PrivacySettingsShape> {
    const next = { ...(await this.getPrivacy(userId)), ...patch };
    this.privacy.set(userId, next);
    return next;
  }

  async addAuditLog(input: { userId: string | null; action: string; resource?: string; ipAddress?: string | null }): Promise<void> {
    const rec: AuditLogRecord = {
      id: randomUUID(), userId: input.userId, action: input.action,
      resource: input.resource ?? '', ipAddress: input.ipAddress ?? null, createdAt: iso(new Date()),
    };
    this.audit.set(rec.id, rec);
  }
  async listAuditLogs(userId: string, limit: number): Promise<AuditLogRecord[]> {
    return [...this.audit.values()]
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  /* --------------------------- data export --------------------------- */
  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    return buildUserExport(this, userId);
  }
}