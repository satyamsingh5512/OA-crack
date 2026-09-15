import type {
  DetectedQuestion, EvaluationCategory, InterviewMode, PrivacySettingsShape,
  QuestionCategory, SessionStatus, Speaker, UserSettingsShape,
  ParsedResume, ParsedJobDescription, UsageSummary,
} from '@ai-assistant/shared';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  mode: InterviewMode;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  score: number | null;
  resumeId: string | null;
  jobDescriptionId: string | null;
}

export interface TranscriptRecord {
  id: string;
  sessionId: string;
  speaker: Speaker;
  text: string;
  timestamp: string;
  confidence: number | null;
}

export interface TranscriptSegmentRecord {
  id: string;
  transcriptId: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface QuestionRecord {
  id: string;
  sessionId: string;
  text: string;
  category: QuestionCategory;
  confidence: number;
  context: string;
  detectedAt: string;
}

export interface AnswerRecord {
  id: string;
  questionId: string;
  text: string;
  keyPoints: string[];
  latencyMs: number;
  provider: string;
  createdAt: string;
}

export interface QuestionWithAnswer extends QuestionRecord {
  answer: AnswerRecord | null;
}

export interface EvaluationRecord {
  id: string;
  sessionId: string;
  overallScore: number;
  categories: Record<string, EvaluationCategory>;
  topImprovements: string[];
  nextPractice: string;
  createdAt: string;
}

export interface ResumeRecord {
  id: string;
  userId: string;
  filename: string;
  content: string;
  parsed: ParsedResume;
  uploadedAt: string;
}

export interface JobDescriptionRecord {
  id: string;
  userId: string;
  title: string;
  content: string;
  parsed: ParsedJobDescription;
  createdAt: string;
}

/** API-safe provider record: never carries key material. */
export interface AiProviderRecord {
  id: string;
  userId: string;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface AiProviderSecretRecord extends AiProviderRecord {
  encryptedApiKey: string;
}

export interface UsageEventRecord {
  id: string;
  userId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  ipAddress: string | null;
  createdAt: string;
}

export interface SessionDetail {
  session: SessionRecord;
  transcripts: TranscriptRecord[];
  questions: QuestionWithAnswer[];
  evaluation: EvaluationRecord | null;
}

export interface NewTranscript {
  speaker: Speaker;
  text: string;
  timestamp?: string;
  confidence?: number;
  segments?: { startMs: number; endMs: number; text: string }[];
}

export interface NewAnswer {
  questionId: string;
  text: string;
  keyPoints: string[];
  latencyMs: number;
  provider: string;
}

export interface NewEvaluation {
  sessionId: string;
  overallScore: number;
  categories: Record<string, EvaluationCategory>;
  topImprovements: string[];
  nextPractice: string;
}

export type DetectedQuestionInput = DetectedQuestion;

/**
 * Storage boundary. Two implementations exist:
 *  - PgRepository    → PostgreSQL via Drizzle (production)
 *  - MemoryRepository → process-local Maps (tests + graceful degradation when
 *                       the database is unreachable, per spec §16)
 * Routes only ever talk to this interface.
 */
export interface Repository {
  readonly driver: 'postgres' | 'memory';
  ping(): Promise<boolean>;

  createUser(input: { email: string; passwordHash: string }): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  /** Export-safe profile lookup: omits the password hash. */
  findPublicUserById(id: string): Promise<{ id: string; email: string; createdAt: string } | null>;
  deleteUser(id: string): Promise<void>;

  saveRefreshToken(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<void>;
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
  revokeAllRefreshTokens(userId: string): Promise<void>;

  createSession(input: { userId: string; mode: InterviewMode; resumeId?: string; jobDescriptionId?: string }): Promise<SessionRecord>;
  getSession(id: string): Promise<SessionRecord | null>;
  getActiveSession(userId: string): Promise<SessionRecord | null>;
  listSessions(userId: string, opts: { limit: number; offset: number }): Promise<SessionRecord[]>;
  listAllSessions(userId: string): Promise<SessionRecord[]>;
  countSessions(userId: string): Promise<number>;
  updateSessionStatus(id: string, status: SessionStatus, endedAt?: string | null): Promise<SessionRecord | null>;
  setSessionScore(id: string, score: number): Promise<void>;
  deleteSession(id: string): Promise<void>;

  addTranscript(sessionId: string, input: NewTranscript): Promise<TranscriptRecord>;
  listTranscripts(sessionId: string): Promise<TranscriptRecord[]>;
  countTranscripts(sessionId: string): Promise<number>;
  deleteTranscripts(sessionId: string): Promise<number>;

  addQuestion(sessionId: string, question: DetectedQuestionInput): Promise<QuestionRecord>;
  listQuestions(sessionId: string): Promise<QuestionRecord[]>;
  listQuestionsForUser(userId: string): Promise<QuestionWithAnswer[]>;

  upsertAnswer(input: NewAnswer): Promise<AnswerRecord>;
  listAnswersForSession(sessionId: string): Promise<AnswerRecord[]>;

  saveEvaluation(input: NewEvaluation): Promise<EvaluationRecord>;
  getEvaluation(sessionId: string): Promise<EvaluationRecord | null>;
  listEvaluationsForUser(userId: string): Promise<EvaluationRecord[]>;
  getSessionDetail(sessionId: string): Promise<SessionDetail | null>;

  createResume(input: { userId: string; filename: string; content: string; parsed: ParsedResume }): Promise<ResumeRecord>;
  listResumes(userId: string): Promise<ResumeRecord[]>;
  getResume(id: string): Promise<ResumeRecord | null>;
  deleteResume(id: string): Promise<void>;

  createJobDescription(input: { userId: string; title: string; content: string; parsed: ParsedJobDescription }): Promise<JobDescriptionRecord>;
  listJobDescriptions(userId: string): Promise<JobDescriptionRecord[]>;
  getJobDescription(id: string): Promise<JobDescriptionRecord | null>;
  deleteJobDescription(id: string): Promise<void>;

  upsertProvider(input: { userId: string; provider: string; encryptedApiKey: string; isDefault: boolean; baseUrl?: string | null; model?: string | null }): Promise<AiProviderRecord>;
  listProviders(userId: string): Promise<AiProviderRecord[]>;
  getProvider(userId: string, provider: string): Promise<AiProviderSecretRecord | null>;
  deleteProvider(userId: string, id: string): Promise<void>;

  addUsageEvent(input: { userId: string; eventType: string; metadata?: Record<string, unknown> }): Promise<UsageEventRecord>;
  listUsageEvents(userId: string, opts: { days: number; limit: number }): Promise<UsageEventRecord[]>;
  aggregateUsage(userId: string, days: number): Promise<UsageSummary>;

  getSettings(userId: string): Promise<UserSettingsShape>;
  updateSettings(userId: string, patch: Partial<UserSettingsShape>): Promise<UserSettingsShape>;
  getPrivacy(userId: string): Promise<PrivacySettingsShape>;
  updatePrivacy(userId: string, patch: Partial<PrivacySettingsShape>): Promise<PrivacySettingsShape>;

  addAuditLog(input: { userId: string | null; action: string; resource?: string; ipAddress?: string | null }): Promise<void>;
  listAuditLogs(userId: string, limit: number): Promise<AuditLogRecord[]>;

  exportUserData(userId: string): Promise<Record<string, unknown>>;
}