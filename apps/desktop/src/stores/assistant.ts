import { create } from 'zustand';
import type { AnswerOutput, DetectedQuestion, InterviewMode, AnswerMode } from '@ai-assistant/shared';
import type { StarSections } from '@/components/modes/BehavioralMode';

export interface TranscriptLine { speaker: 'interviewer' | 'candidate' | 'system'; text: string; at: string; partial?: boolean }

export type AssistantStatus = 'idle' | 'listening' | 'processing' | 'paused' | 'error';

export interface Evaluation { scores: Record<string, number>; summary?: string }

interface AssistantState {
  active: boolean;
  paused: boolean;
  status: AssistantStatus;
  mode: InterviewMode;
  answerMode: AnswerMode;
  transcript: TranscriptLine[];
  question: DetectedQuestion | null;
  answer: AnswerOutput | null;
  streaming: string;
  isStreaming: boolean;
  evaluation: Evaluation | null;
  evaluationDimensions: string[];
  /** Applied STAR example for behavioral mode (populated by "Use as inspiration"). */
  starExample: StarSections | null;
  captureOn: boolean;
  level: number;
  error: string | null;
  /** Overlay mirror (surface pin state; main process owns the real always-on-top flag). */
  pinned: boolean;
  set: (p: Partial<AssistantState>) => void;
  pushTranscript: (l: TranscriptLine) => void;
  requestAnswer: () => void;
}

export const useAssistant = create<AssistantState>((set) => ({
  active: false, paused: false, status: 'idle', mode: 'mock', answerMode: 'concise',
  transcript: [], question: null, answer: null, streaming: '', isStreaming: false,
  evaluation: null,
  evaluationDimensions: ['clarity', 'structure', 'relevance', 'confidence'],
  starExample: null,
  captureOn: false, level: 0, error: null, pinned: true,
  set: (p) => set(p),
  pushTranscript: (l) => set((s) => ({ transcript: [...s.transcript.slice(-499), l] })),
  requestAnswer: () => set({ isStreaming: true, streaming: '', answer: null }),
}));
