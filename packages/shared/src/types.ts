export type InterviewMode = 'mock' | 'coding' | 'behavioral' | 'technical' | 'accessibility';
export type AnswerMode = 'concise' | 'detailed' | 'technical' | 'star' | 'system_design' | 'coding' | 'executive';
export type QuestionCategory =
  | 'behavioral' | 'technical' | 'coding' | 'system_design' | 'database'
  | 'networking' | 'project' | 'resume' | 'hr' | 'follow_up' | 'clarification' | 'other';
export type Speaker = 'interviewer' | 'candidate' | 'system';
export type TrayState = 'ready' | 'listening' | 'processing' | 'paused' | 'error' | 'offline';
export type SessionStatus = 'active' | 'paused' | 'ended';

export interface DetectedQuestion {
  question: string;
  category: QuestionCategory;
  confidence: number;
  detectedAt: string;
  context: string;
}

export interface AnswerInput {
  transcript: string;
  detectedQuestion: DetectedQuestion;
  conversationHistory: { speaker: Speaker; text: string }[];
  screenContext?: string;
  resumeContext?: string;
  jobDescription?: string;
  interviewMode: InterviewMode;
  answerMode: AnswerMode;
}

export interface AnswerOutput {
  answer: string;
  keyPoints: string[];
  confidence: number;
  reasoningSummary: string;
  followUpQuestions: string[];
  citations: string[];
  latencyMs: number;
}

export interface EvaluationCategory { score: number; strengths: string[]; weaknesses: string[]; recommendations: string[]; }
export interface SessionEvaluation {
  overallScore: number;
  categories: Record<string, EvaluationCategory>;
  topImprovements: string[];
  nextPractice: string;
}
