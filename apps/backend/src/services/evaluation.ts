import {
  EVALUATION_CATEGORY_KEYS, EVALUATION_CATEGORY_LABELS, interviewModeInfo,
  type EvaluationCategory, type EvaluationCategoryKey, type InterviewMode, type QuestionCategory,
} from '@ai-assistant/shared';

export interface EvaluationInput {
  mode: InterviewMode;
  durationMs: number;
  transcripts: { speaker: string; text: string }[];
  questions: { text: string; category: QuestionCategory; confidence: number }[];
  answers: { text: string; keyPoints: string[]; latencyMs: number }[];
}

export interface EvaluationResult {
  overallScore: number;
  categories: Record<EvaluationCategoryKey, EvaluationCategory>;
  topImprovements: string[];
  nextPractice: string;
}

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const words = (s: string): string[] => s.toLowerCase().match(/[a-z0-9'+#.-]+/g) ?? [];
const sentences = (s: string): string[] => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

const FILLERS = ['um', 'uh', 'like', 'you know', 'kind of', 'sort of', 'basically', 'actually'];
const HEDGES = ['maybe', 'i think', 'probably', 'i guess', 'possibly', 'not sure', 'i believe'];
const ASSERTIVES = ['i led', 'i built', 'i owned', 'i designed', 'i shipped', 'i implemented', 'i decided', 'we delivered', 'i migrated'];

const TECHNICAL_TERMS = [
  'latency', 'throughput', 'complexity', 'cache', 'index', 'queue', 'sharding', 'replication',
  'transaction', 'idempotent', 'backpressure', 'observability', 'rollout', 'tradeoff', 'api', 'sql',
];
const STRUCTURE_TERMS = ['first', 'then', 'next', 'finally', 'because', 'so that', 'approach', 'steps', 'result'];
const STAR_TERMS = ['situation', 'task', 'action', 'result', 'context', 'impact'];
const DESIGN_TERMS = ['requirement', 'component', 'scal', 'reliab', 'secur', 'tradeoff', 'data flow', 'cache', 'queue', 'monitor'];

function hitRatio(text: string, terms: string[]): number {
  const t = text.toLowerCase();
  if (terms.length === 0) return 0;
  const hits = terms.filter((term) => t.includes(term)).length;
  return hits / terms.length;
}

function hasNumbers(text: string): boolean {
  return /\b\d+([.,]\d+)?\s?(%|ms|s|x|k|m|qps|rps|users|requests)?\b/i.test(text);
}

function categoryScore(base: number, strengths: string[], weaknesses: string[], recommendations: string[]): EvaluationCategory {
  return { score: clamp(base), strengths, weaknesses, recommendations };
}

const NOT_ASSESSED = 'Not assessed in this session';

const NOT_ASSESSED_RECOMMENDATIONS: Record<EvaluationCategoryKey, string> = {
  technical_knowledge: 'Answer a technical question so technical knowledge can be scored.',
  communication: 'Answer aloud so communication can be scored.',
  structure: 'Answer a full question so structure can be scored.',
  conciseness: 'Answer a full question so conciseness can be scored.',
  confidence: 'Answer aloud so confidence can be scored.',
  problem_solving: 'Practice a coding or design prompt to get a real score.',
  system_design: 'Practice a system design prompt to get a real score.',
  behavioral_responses: 'Practice behavioural questions to get a real score.',
};

/**
 * Deterministic, explainable session evaluation (§11).
 * Heuristics only — no chain-of-thought is produced or exposed.
 */
export function evaluateSession(input: EvaluationInput): EvaluationResult {
  // A session with nothing to score gets an explicit not-assessed report (§11),
  // never a hallucinated score.
  if (input.questions.length === 0 && input.answers.length === 0) {
    const categories = Object.fromEntries(
      EVALUATION_CATEGORY_KEYS.map((key) => [key, {
        score: 0, strengths: [], weaknesses: [NOT_ASSESSED],
        recommendations: [NOT_ASSESSED_RECOMMENDATIONS[key]],
      }]),
    ) as unknown as Record<EvaluationCategoryKey, EvaluationCategory>;
    return {
      overallScore: 0,
      categories,
      topImprovements: [
        'Answer at least three questions aloud in a single session.',
        'Mix one behavioural and one technical question so every category is assessed.',
        'Keep answers to 60-180 words and close with a measurable result.',
      ],
      nextPractice: `Next ${interviewModeInfo(input.mode).label}: run a full practice session so this report has data to score.`,
    };
  }

  const answerText = input.answers.map((a) => a.text).join(' ').trim();
  const candidateText = input.transcripts.filter((t) => t.speaker === 'candidate').map((t) => t.text).join(' ').trim();
  const text = answerText || candidateText;
  const w = words(text);
  const sents = sentences(text);
  const avgSentenceWords = sents.length > 0 ? w.length / sents.length : 0;
  const answerCount = input.answers.length;
  const avgAnswerWords = answerCount > 0 ? w.length / answerCount : 0;
  const coverage = input.questions.length > 0 ? answerCount / input.questions.length : 0;
  const avgLatencyMs = answerCount > 0 ? input.answers.reduce((s, a) => s + a.latencyMs, 0) / answerCount : 0;
  const avgKeyPoints = answerCount > 0 ? input.answers.reduce((s, a) => s + a.keyPoints.length, 0) / answerCount : 0;

  const filler = hitRatio(text, FILLERS);
  const hedge = hitRatio(text, HEDGES);
  const assertive = hitRatio(text, ASSERTIVES);
  const technical = hitRatio(text, TECHNICAL_TERMS);
  const structure = hitRatio(text, STRUCTURE_TERMS);
  const star = hitRatio(text, STAR_TERMS);
  const design = hitRatio(text, DESIGN_TERMS);

  const present = new Set<QuestionCategory>(input.questions.map((q) => q.category));
  const askedDesign = present.has('system_design');
  const askedBehavioral = present.has('behavioral') || present.has('project') || present.has('hr') || present.has('resume');
  const askedProblemSolving = present.has('coding') || present.has('system_design') || present.has('technical');

  const categories: Record<EvaluationCategoryKey, EvaluationCategory> = {
    technical_knowledge: categoryScore(
      40 + technical * 30 + (hasNumbers(text) ? 8 : 0) + Math.min(coverage, 1) * 14 + Math.min(avgKeyPoints, 3) * 3,
      technical > 0.25 ? ['Uses concrete technical vocabulary'] : [],
      technical <= 0.25 ? ['Answers stay abstract; few technical specifics'] : [],
      technical <= 0.25 ? ['Name the concrete technology, its tradeoff, and one measurable result'] : [],
    ),
    communication: categoryScore(
      92 - filler * 30 - Math.abs(avgSentenceWords - 18) * 1.2 - (w.length < 40 ? 15 : 0),
      filler < 0.1 && avgSentenceWords > 8 ? ['Clear, low-filler delivery'] : [],
      filler >= 0.1 ? ['Frequent filler words reduce clarity'] : [],
      filler >= 0.1 ? ['Record a 60-second answer and cut every "um", "like", and "basically"'] : [],
    ),
    structure: categoryScore(
      45 + structure * 40 + Math.min(avgKeyPoints, 4) * 4 + (star > 0.2 ? 6 : 0),
      structure > 0.2 || avgKeyPoints >= 3 ? ['Answer is organised into explicit steps'] : [],
      structure <= 0.2 ? ['Answers ramble before reaching the point'] : [],
      structure <= 0.2 ? ['Lead with the headline, then 2-3 supporting points in order'] : [],
    ),
    conciseness: categoryScore(
      avgAnswerWords === 0 ? 30 : 110 - Math.abs(avgAnswerWords - 110) * 0.35,
      avgAnswerWords >= 60 && avgAnswerWords <= 180 ? ['Answer length is interview-appropriate'] : [],
      avgAnswerWords > 220 ? ['Answers are longer than interviewers expect'] : [],
      avgAnswerWords > 220 ? ['Target 60-180 words per answer; park the rest for follow-ups'] : [],
    ),
    confidence: categoryScore(
      62 + assertive * 30 - hedge * 25 + (avgLatencyMs > 0 && avgLatencyMs < 12000 ? 6 : 0),
      assertive > 0.15 ? ['Owns the work with first-person, decisive language'] : [],
      hedge >= 0.15 ? ['Hedging language ("I think", "maybe") weakens ownership'] : [],
      hedge >= 0.15 ? ['Rehearse answers using "I led / I built / the result was" phrasing'] : [],
    ),
    problem_solving: askedProblemSolving ? categoryScore(
      45 + structure * 35 + technical * 12 + (hasNumbers(text) ? 6 : 0),
      structure > 0.2 ? ['Walks through approach before implementation'] : [],
      structure <= 0.2 ? ['Jumps to a solution without stating constraints'] : [],
      structure <= 0.2 ? ['Start with constraints and success criteria, then the approach'] : [],
    ) : categoryScore(60, [], [NOT_ASSESSED], [NOT_ASSESSED_RECOMMENDATIONS.problem_solving]),
    system_design: askedDesign ? categoryScore(
      35 + design * 55 + Math.min(coverage, 1) * 10,
      design > 0.4 ? ['Covers components, scaling, and reliability'] : [],
      design <= 0.4 ? ['Design answer misses scaling, reliability or security'] : [],
      design <= 0.4 ? ['Practice the 9-part frame: requirements → assumptions → architecture → components → data flow → scaling → reliability → security → tradeoffs'] : [],
    ) : categoryScore(60, [], [NOT_ASSESSED], [NOT_ASSESSED_RECOMMENDATIONS.system_design]),
    behavioral_responses: askedBehavioral ? categoryScore(
      40 + star * 50 + (hasNumbers(text) ? 10 : 0),
      star > 0.4 ? ['Uses Situation/Task/Action/Result framing'] : [],
      star <= 0.4 ? ['Stories lack a quantified result'] : [],
      star <= 0.4 ? ['Close every story with a measurable result and what you would change'] : [],
    ) : categoryScore(60, [], [NOT_ASSESSED], [NOT_ASSESSED_RECOMMENDATIONS.behavioral_responses]),
  };

  const assessed = EVALUATION_CATEGORY_KEYS.filter((k) => !categories[k].weaknesses.includes(NOT_ASSESSED));
  let weighted = 0;
  let totalWeight = 0;
  for (const key of assessed) {
    const weight = weightFor(key, input.mode, askedDesign);
    weighted += categories[key].score * weight;
    totalWeight += weight;
  }
  const overallScore = clamp(totalWeight > 0 ? weighted / totalWeight : 0);

  const ranked = [...assessed].sort((a, b) => categories[a].score - categories[b].score);
  const improvements: string[] = [];
  for (const key of ranked) {
    const rec = categories[key].recommendations[0];
    if (rec && !improvements.includes(rec)) improvements.push(rec);
    if (improvements.length >= 5) break;
  }
  if (improvements.length === 0) {
    improvements.push('Run a session with at least three answered questions to generate improvement targets.');
  }

  return {
    overallScore,
    categories,
    topImprovements: improvements.slice(0, 5),
    nextPractice: buildNextPractice(input.mode, ranked),
  };
}

function weightFor(key: EvaluationCategoryKey, mode: InterviewMode, askedDesign: boolean): number {
  const weights: Record<EvaluationCategoryKey, number> = {
    technical_knowledge: 1, communication: 1, structure: 1, conciseness: 0.8, confidence: 0.8,
    problem_solving: 1, system_design: 0.8, behavioral_responses: 0.8,
  };
  let weight = weights[key];
  if (mode === 'coding' && (key === 'problem_solving' || key === 'technical_knowledge')) weight += 0.7;
  if (mode === 'behavioral' && (key === 'behavioral_responses' || key === 'structure')) weight += 0.7;
  if (mode === 'technical' && key === 'technical_knowledge') weight += 0.7;
  if (mode === 'accessibility' && key === 'communication') weight += 0.5;
  if (key === 'system_design' && askedDesign) weight += 0.5;
  return weight;
}

function buildNextPractice(mode: InterviewMode, ranked: EvaluationCategoryKey[]): string {
  const modeLabel = interviewModeInfo(mode).label;
  const focus = ranked[0] ? EVALUATION_CATEGORY_LABELS[ranked[0]] : 'Communication';
  const secondary = ranked[1] ? EVALUATION_CATEGORY_LABELS[ranked[1]] : null;
  const suffix = secondary ? `, then ${secondary}` : '';
  return `Next ${modeLabel}: focus on ${focus}${suffix}. Plan 20 minutes: 5 questions, answer aloud, then review this report.`;
}

/** Adapter that turns stored session rows into an evaluation (§11 reports). */
export function evaluateStoredSession(input: {
  mode: InterviewMode;
  startedAt: string;
  endedAt: string | null;
  transcripts: { speaker: string; text: string }[];
  questions: { text: string; category: QuestionCategory; confidence: number }[];
  answers: { text: string; keyPoints: string[]; latencyMs: number }[];
}): EvaluationResult {
  const started = Date.parse(input.startedAt);
  const ended = input.endedAt != null ? Date.parse(input.endedAt) : Date.now();
  const durationMs = Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : 0;
  return evaluateSession({
    mode: input.mode,
    durationMs,
    transcripts: input.transcripts,
    questions: input.questions,
    answers: input.answers,
  });
}