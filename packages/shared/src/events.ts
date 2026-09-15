import { z } from 'zod';
import type { DetectedQuestion, InterviewMode, Speaker, AnswerOutput } from './types.js';

export type SessionEvent =
  | { type: 'session.started'; sessionId: string; mode: InterviewMode }
  | { type: 'session.paused'; sessionId: string }
  | { type: 'session.resumed'; sessionId: string }
  | { type: 'audio.started'; deviceId: string }
  | { type: 'audio.stopped'; deviceId: string }
  | { type: 'transcript.partial'; text: string; speaker: Speaker }
  | { type: 'transcript.final'; text: string; speaker: Speaker; timestamp: string }
  | { type: 'question.detected'; question: DetectedQuestion }
  | { type: 'ai.requested'; questionId: string }
  | { type: 'ai.streaming'; questionId: string; token: string }
  | { type: 'ai.completed'; questionId: string; answer: AnswerOutput }
  | { type: 'ai.error'; questionId: string; error: string }
  | { type: 'screen.capture'; active: boolean }
  | { type: 'device.changed'; deviceType: string; deviceId: string }
  | { type: 'session.ended'; sessionId: string; durationMs: number };

export const WS_EVENTS = [
  'session.started','session.paused','session.resumed','audio.started','audio.stopped',
  'transcript.partial','transcript.final','question.detected','ai.requested','ai.streaming',
  'ai.completed','ai.error','screen.capture','device.changed','session.ended',
] as const;

/* ------------------------------------------------------------------ *
 * Validation: every realtime payload is zod-checked before broadcast
 * or persistence, so a misbehaving client cannot poison other clients
 * or the transcript store (§15, §16).
 * ------------------------------------------------------------------ */

const speakerSchema = z.enum(['interviewer', 'candidate', 'system']);

const detectedQuestionSchema = z.object({
  question: z.string().min(1).max(2000),
  category: z.string().min(1).max(32),
  confidence: z.number().min(0).max(1),
  detectedAt: z.string().datetime().or(z.string().min(1)),
  context: z.string().max(8000),
});

const answerOutputSchema = z.object({
  answer: z.string().max(20000),
  keyPoints: z.array(z.string().max(500)).max(20),
  confidence: z.number().min(0).max(1),
  reasoningSummary: z.string().max(2000),
  followUpQuestions: z.array(z.string().max(500)).max(10),
  citations: z.array(z.string().max(500)).max(10),
  latencyMs: z.number().int().min(0),
});

export const sessionEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session.started'), sessionId: z.string().uuid(), mode: z.enum(['mock', 'coding', 'behavioral', 'technical', 'accessibility']) }),
  z.object({ type: z.literal('session.paused'), sessionId: z.string().uuid() }),
  z.object({ type: z.literal('session.resumed'), sessionId: z.string().uuid() }),
  z.object({ type: z.literal('audio.started'), deviceId: z.string().max(200) }),
  z.object({ type: z.literal('audio.stopped'), deviceId: z.string().max(200) }),
  z.object({ type: z.literal('transcript.partial'), text: z.string().max(8000), speaker: speakerSchema }),
  z.object({ type: z.literal('transcript.final'), text: z.string().min(1).max(8000), speaker: speakerSchema, timestamp: z.string().min(1) }),
  z.object({ type: z.literal('question.detected'), question: detectedQuestionSchema }),
  z.object({ type: z.literal('ai.requested'), questionId: z.string().uuid() }),
  z.object({ type: z.literal('ai.streaming'), questionId: z.string().uuid(), token: z.string().max(4000) }),
  z.object({ type: z.literal('ai.completed'), questionId: z.string().uuid(), answer: answerOutputSchema }),
  z.object({ type: z.literal('ai.error'), questionId: z.string().uuid(), error: z.string().max(1000) }),
  z.object({ type: z.literal('screen.capture'), active: z.boolean() }),
  z.object({ type: z.literal('device.changed'), deviceType: z.string().max(100), deviceId: z.string().max(200) }),
  z.object({ type: z.literal('session.ended'), sessionId: z.string().uuid(), durationMs: z.number().int().min(0) }),
]);

export type ValidatedSessionEvent = z.infer<typeof sessionEventSchema>;

export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(10) }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('session.subscribe'), sessionId: z.string().uuid() }),
  z.object({ type: z.literal('session.unsubscribe'), sessionId: z.string().uuid() }),
  z.object({ type: z.literal('session.event'), sessionId: z.string().uuid(), event: sessionEventSchema }),
]);

export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
