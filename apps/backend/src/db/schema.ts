import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, timestamp, boolean, integer, real, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

/** All timestamps are timestamptz returned as ISO-ish strings and normalized by the repo layer. */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('refresh_tokens_user_idx').on(t.userId)]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull(),
  status: text('status').notNull().default('active'),
  startedAt: ts('started_at').notNull().defaultNow(),
  endedAt: ts('ended_at'),
  score: real('score'),
  resumeId: uuid('resume_id'),
  jobDescriptionId: uuid('job_description_id'),
}, (t) => [
  index('sessions_user_started_idx').on(t.userId, t.startedAt.desc()),
  uniqueIndex('sessions_one_active_per_user_idx').on(t.userId).where(sql`status = 'active'`),
]);

export const transcripts = pgTable('transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  speaker: text('speaker').notNull(),
  text: text('text').notNull(),
  timestamp: ts('timestamp').notNull().defaultNow(),
  confidence: real('confidence'),
}, (t) => [index('transcripts_session_idx').on(t.sessionId, t.timestamp)]);

export const transcriptSegments = pgTable('transcript_segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  transcriptId: uuid('transcript_id').notNull().references(() => transcripts.id, { onDelete: 'cascade' }),
  startMs: integer('start_ms').notNull(),
  endMs: integer('end_ms').notNull(),
  text: text('text').notNull(),
}, (t) => [index('transcript_segments_transcript_idx').on(t.transcriptId)]);

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  category: text('category').notNull(),
  confidence: real('confidence').notNull().default(0),
  context: text('context').notNull().default(''),
  detectedAt: ts('detected_at').notNull().defaultNow(),
}, (t) => [index('questions_session_category_idx').on(t.sessionId, t.category)]);

export const answers = pgTable('answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id').notNull().unique().references(() => questions.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  keyPoints: text('key_points').array().notNull().default(sql`'{}'::text[]`),
  latencyMs: integer('latency_ms').notNull().default(0),
  provider: text('provider').notNull().default('unknown'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const evaluations = pgTable('evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().unique().references(() => sessions.id, { onDelete: 'cascade' }),
  overallScore: real('overall_score').notNull(),
  categoriesJson: jsonb('categories_json').notNull().default(sql`'{}'::jsonb`),
  topImprovements: text('top_improvements').array().notNull().default(sql`'{}'::text[]`),
  nextPractice: text('next_practice').notNull().default(''),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const resumes = pgTable('resumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  content: text('content').notNull().default(''),
  parsedJson: jsonb('parsed_json').notNull().default(sql`'{}'::jsonb`),
  uploadedAt: ts('uploaded_at').notNull().defaultNow(),
}, (t) => [index('resumes_user_idx').on(t.userId, t.uploadedAt.desc())]);

export const jobDescriptions = pgTable('job_descriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  parsedJson: jsonb('parsed_json').notNull().default(sql`'{}'::jsonb`),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('job_descriptions_user_idx').on(t.userId, t.createdAt.desc())]);

export const aiProviders = pgTable('ai_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  encryptedApiKey: text('encrypted_api_key').notNull(),
  baseUrl: text('base_url'),
  model: text('model'),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('usage_events_user_created_idx').on(t.userId, t.createdAt.desc())]);

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  settingsJson: jsonb('settings_json').notNull().default(sql`'{}'::jsonb`),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const privacySettings = pgTable('privacy_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  micEnabled: boolean('mic_enabled').notNull().default(true),
  systemAudioEnabled: boolean('system_audio_enabled').notNull().default(false),
  screenEnabled: boolean('screen_enabled').notNull().default(false),
  cloudAi: boolean('cloud_ai').notNull().default(true),
  cloudTranscription: boolean('cloud_transcription').notNull().default(true),
  sessionRecording: boolean('session_recording').notNull().default(false),
  retentionDays: integer('retention_days').notNull().default(7),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resource: text('resource').notNull().default(''),
  ipAddress: text('ip_address'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('audit_logs_user_created_idx').on(t.userId, t.createdAt.desc())]);