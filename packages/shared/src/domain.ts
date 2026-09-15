import type { AnswerMode, InterviewMode, QuestionCategory } from './types.js';

/* ------------------------------------------------------------------ *
 * Resume / job description context (§12)
 * ------------------------------------------------------------------ */

export interface ResumeExperience {
  title: string;
  company: string;
  period: string;
  summary: string;
}

export interface ParsedResume {
  skills: string[];
  technologies: string[];
  projects: string[];
  experience: ResumeExperience[];
  education: string[];
  links: string[];
}

export interface ParsedJobDescription {
  title: string;
  skills: string[];
  responsibilities: string[];
  seniority: string | null;
}

export type MatchConfidence = 'high' | 'medium' | 'low';

export interface SkillMatch {
  requiredSkill: string;
  userEvidence: string;
  confidence: MatchConfidence;
  potentialQuestion: string;
}

export interface GeneratedQuestion {
  question: string;
  category: QuestionCategory;
  rationale: string;
  source: 'resume' | 'job_description' | 'combined';
}

export const EMPTY_RESUME: ParsedResume = {
  skills: [], technologies: [], projects: [], experience: [], education: [], links: [],
};

export const EMPTY_JOB_DESCRIPTION: ParsedJobDescription = {
  title: '', skills: [], responsibilities: [], seniority: null,
};

/* ------------------------------------------------------------------ *
 * Settings / privacy (§13, §14)
 * ------------------------------------------------------------------ */

export type CaptureMode = 'never' | 'manual' | 'on-question' | 'periodic';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserSettingsShape {
  theme: ThemePreference;
  answerMode: AnswerMode;
  captureMode: CaptureMode;
  fontScale: number;
  panelOpacity: number;
  reducedMotion: boolean;
  autoLaunch: boolean;
  keepAudioRecording: boolean;
  defaultProvider: string | null;
  defaultInterviewMode: InterviewMode;
}

export const DEFAULT_USER_SETTINGS: UserSettingsShape = {
  theme: 'system',
  answerMode: 'concise',
  captureMode: 'on-question',
  fontScale: 1,
  panelOpacity: 1,
  reducedMotion: false,
  autoLaunch: false,
  keepAudioRecording: false,
  defaultProvider: null,
  defaultInterviewMode: 'mock',
};

export interface PrivacySettingsShape {
  micEnabled: boolean;
  systemAudioEnabled: boolean;
  screenEnabled: boolean;
  cloudAi: boolean;
  cloudTranscription: boolean;
  sessionRecording: boolean;
  retentionDays: number;
}

/** Minimal retention by default; raw audio is never stored unless opted in. */
export const DEFAULT_PRIVACY_SETTINGS: PrivacySettingsShape = {
  micEnabled: true,
  systemAudioEnabled: false,
  screenEnabled: false,
  cloudAi: true,
  cloudTranscription: true,
  sessionRecording: false,
  retentionDays: 7,
};

/* ------------------------------------------------------------------ *
 * Evaluation (§11) and dashboard metrics (§10)
 * ------------------------------------------------------------------ */

export const EVALUATION_CATEGORY_KEYS = [
  'technical_knowledge',
  'communication',
  'structure',
  'conciseness',
  'confidence',
  'problem_solving',
  'system_design',
  'behavioral_responses',
] as const;

export type EvaluationCategoryKey = (typeof EVALUATION_CATEGORY_KEYS)[number];

export const EVALUATION_CATEGORY_LABELS: Record<EvaluationCategoryKey, string> = {
  technical_knowledge: 'Technical Knowledge',
  communication: 'Communication',
  structure: 'Structure',
  conciseness: 'Conciseness',
  confidence: 'Confidence',
  problem_solving: 'Problem Solving',
  system_design: 'System Design',
  behavioral_responses: 'Behavioral Responses',
};

export interface DashboardMetrics {
  sessionsCompleted: number;
  questionsAnswered: number;
  averageResponseQuality: number;
  technicalScore: number;
  communicationScore: number;
  confidenceScore: number;
  questionsByCategory: { category: QuestionCategory; count: number }[];
  performanceOverTime: { date: string; score: number }[];
  weakAreas: { category: string; score: number }[];
  responseLatency: { bucket: string; count: number }[];
  interviewReadiness: number;
}

export const EMPTY_DASHBOARD_METRICS: DashboardMetrics = {
  sessionsCompleted: 0,
  questionsAnswered: 0,
  averageResponseQuality: 0,
  technicalScore: 0,
  communicationScore: 0,
  confidenceScore: 0,
  questionsByCategory: [],
  performanceOverTime: [],
  weakAreas: [],
  responseLatency: [],
  interviewReadiness: 0,
};

export interface UsageSummary {
  sessions: number;
  questionsAnswered: number;
  aiRequests: number;
  aiTokens: number;
  transcriptionMinutes: number;
  audioMinutes: number;
  screenCaptures: number;
}

export interface MetricsSnapshot {
  uptimeMs: number;
  requests: number;
  errors: number;
  errorRate: number;
  p95LatencyMs: number;
  wsConnections: number;
  dbHealthy: boolean;
  dbDriver: 'postgres' | 'memory';
  aiRequests: number;
  transcriptionMinutes: number;
}

/* ------------------------------------------------------------------ *
 * Interview modes (§1) — drives the tray menu, desktop and /interview-modes
 * ------------------------------------------------------------------ */

export interface InterviewModeInfo {
  id: InterviewMode;
  label: string;
  description: string;
  defaultAnswerMode: AnswerMode;
}

export const INTERVIEW_MODES: InterviewModeInfo[] = [
  { id: 'mock', label: 'Mock Interview', description: 'General end-to-end practice with mixed question types.', defaultAnswerMode: 'concise' },
  { id: 'coding', label: 'Practice Coding Interview', description: 'Algorithmic prompts with approach and complexity guidance.', defaultAnswerMode: 'coding' },
  { id: 'behavioral', label: 'Behavioral Interview', description: 'STAR-structured stories about your real experience.', defaultAnswerMode: 'star' },
  { id: 'technical', label: 'Technical Interview', description: 'Deep technical questions about your stack and tradeoffs.', defaultAnswerMode: 'technical' },
  { id: 'accessibility', label: 'Accessibility Assistance', description: 'Live transcription and structured prompting support.', defaultAnswerMode: 'detailed' },
];

export function interviewModeInfo(mode: InterviewMode): InterviewModeInfo {
  return INTERVIEW_MODES.find((m) => m.id === mode) ?? INTERVIEW_MODES[0];
}