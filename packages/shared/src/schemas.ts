import { z } from 'zod';

/* ----------------------------- auth ----------------------------- */
export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});
export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

/* ---------------------------- sessions --------------------------- */
export const sessionModeSchema = z.enum(['mock', 'coding', 'behavioral', 'technical', 'accessibility']);
export const answerModeSchema = z.enum(['concise', 'detailed', 'technical', 'star', 'system_design', 'coding', 'executive']);
export const questionCategorySchema = z.enum([
  'behavioral', 'technical', 'coding', 'system_design', 'database',
  'networking', 'project', 'resume', 'hr', 'follow_up', 'clarification', 'other',
]);
export const speakerSchema = z.enum(['interviewer', 'candidate', 'system']);

export const createSessionSchema = z.object({
  mode: sessionModeSchema,
  resumeId: z.string().uuid().optional(),
  jobDescriptionId: z.string().uuid().optional(),
});

export const appendTranscriptSchema = z.object({
  speaker: speakerSchema,
  text: z.string().min(1).max(8000),
  timestamp: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1).optional(),
  segments: z.array(z.object({
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    text: z.string().max(8000),
  })).max(200).optional(),
});

export const appendQuestionSchema = z.object({
  text: z.string().min(1).max(2000),
  category: questionCategorySchema,
  confidence: z.number().min(0).max(1),
  context: z.string().max(8000).optional(),
  detectedAt: z.string().datetime().optional(),
});

export const appendAnswerSchema = z.object({
  questionId: z.string().uuid(),
  text: z.string().min(1).max(20000),
  keyPoints: z.array(z.string().max(500)).max(20).default([]),
  latencyMs: z.number().int().min(0).max(600000).default(0),
  provider: z.string().max(64).default('unknown'),
});

/* ------------------------------- AI ------------------------------ */
export const aiQuestionSchema = z.object({
  transcript: z.string().min(1).max(20000),
  question: z.string().min(1).max(2000),
  category: questionCategorySchema.default('other'),
  interviewMode: sessionModeSchema.default('mock'),
  answerMode: answerModeSchema.default('concise'),
  conversationHistory: z.array(z.object({ speaker: speakerSchema, text: z.string().max(8000) })).max(200).default([]),
  screenContext: z.string().max(8000).optional(),
  resumeContext: z.string().max(8000).optional(),
  jobDescription: z.string().max(8000).optional(),
  sessionId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
  stream: z.boolean().default(false),
});

export const aiEvaluateSchema = z.object({
  question: z.string().min(1).max(2000),
  answer: z.string().min(1).max(20000),
  category: questionCategorySchema.default('other'),
});

export const aiSummarizeSchema = z.object({ transcript: z.string().min(1).max(200000) });

/* --------------------- resume / job descriptions ------------------ */
export const resumeUploadSchema = z.object({
  filename: z.string().min(1).max(255).default('resume.txt'),
  text: z.string().min(20).max(200000),
});

export const jobDescriptionSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(20).max(200000),
});

export const generatedQuestionsQuerySchema = z.object({
  jobDescriptionId: z.string().uuid().optional(),
  count: z.coerce.number().int().min(1).max(25).default(10),
});

/* --------------------- settings / privacy / keys ------------------ */
export const settingsPatchSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  answerMode: answerModeSchema.optional(),
  captureMode: z.enum(['never', 'manual', 'on-question', 'periodic']).optional(),
  fontScale: z.number().min(0.5).max(3).optional(),
  panelOpacity: z.number().min(0.2).max(1).optional(),
  reducedMotion: z.boolean().optional(),
  autoLaunch: z.boolean().optional(),
  keepAudioRecording: z.boolean().optional(),
  defaultProvider: z.string().max(64).nullable().optional(),
  defaultInterviewMode: sessionModeSchema.optional(),
}).strict();

export const privacyPatchSchema = z.object({
  micEnabled: z.boolean().optional(),
  systemAudioEnabled: z.boolean().optional(),
  screenEnabled: z.boolean().optional(),
  cloudAi: z.boolean().optional(),
  cloudTranscription: z.boolean().optional(),
  sessionRecording: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
}).strict();

export const providerUpsertSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'ollama', 'openai-compatible', 'deepgram', 'groq', 'local-whisper']),
  apiKey: z.string().min(8).max(512),
  isDefault: z.boolean().default(false),
  baseUrl: z.string().url().max(300).optional(),
  model: z.string().max(120).optional(),
});

/* ------------------------- usage / pagination --------------------- */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const usageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

/* ------------------------ realtime messages ---------------------- */
export const wsAuthSchema = z.object({ type: z.literal('auth'), token: z.string().min(10) });
export const wsPingSchema = z.object({ type: z.literal('ping') });

export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type AiQuestionInput = z.infer<typeof aiQuestionSchema>;
export type AppendTranscriptInput = z.infer<typeof appendTranscriptSchema>;
export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;
export type PrivacyPatchInput = z.infer<typeof privacyPatchSchema>;
export type ProviderUpsertInput = z.infer<typeof providerUpsertSchema>;
