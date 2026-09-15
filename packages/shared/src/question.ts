import type { QuestionCategory } from './types.js';

const RULES: { pattern: RegExp; category: QuestionCategory }[] = [
  { pattern: /tell me about (a time|yourself)|strength|weakness|conflict|disagre|STAR/i, category: 'behavioral' },
  { pattern: /big-?o|complexity|algorithm|leetcode|reverse|sort|tree|graph|dynamic programming/i, category: 'coding' },
  { pattern: /design (a|an|system)|scale|load balanc|microservice|cache|shard/i, category: 'system_design' },
  { pattern: /sql|database|index|transaction|normaliz|postgres|mongodb/i, category: 'database' },
  { pattern: /tcp|udp|http|dns|load|latency|network/i, category: 'networking' },
  { pattern: /project|built|led|challenge/i, category: 'project' },
  { pattern: /resume|experience|previous role/i, category: 'resume' },
  { pattern: /salary|why (this|our) company|where do you see|questions for (us|me)/i, category: 'hr' },
];

const QUESTION_RE = /\?\s*$|^(what|why|how|when|where|who|which|tell me|describe|explain|walk me through)\b/i;

/** Debounce-friendly classifier: returns null when text is not question-like. */
export function classifyQuestion(text: string): { category: QuestionCategory; confidence: number } | null {
  const t = text.trim();
  if (t.length < 12) return null;
  if (!QUESTION_RE.test(t)) return null;
  for (const r of RULES) if (r.pattern.test(t)) return { category: r.category, confidence: 0.85 };
  return { category: 'other', confidence: 0.5 };
}

/** Contextual buffering: accumulate words until pause/question mark before triggering AI. */
export function shouldTriggerAI(buffer: string, silenceMs: number): boolean {
  if (buffer.trim().length < 20) return false;
  if (/\?\s*$/.test(buffer.trim()) && silenceMs > 600) return true;
  if (buffer.trim().length > 280 && silenceMs > 1200) return true;
  return false;
}
