import {
  EMPTY_DASHBOARD_METRICS, EVALUATION_CATEGORY_LABELS,
  type DashboardMetrics, type EvaluationCategory, type EvaluationCategoryKey, type QuestionCategory,
} from '@ai-assistant/shared';

export interface MetricsInput {
  sessions: { id: string; startedAt: string; endedAt: string | null; status: string; score: number | null }[];
  questions: { category: QuestionCategory; detectedAt: string; latencyMs: number | null }[];
  evaluations: { sessionId: string; overallScore: number; categories: Record<string, EvaluationCategory> }[];
}

const avg = (nums: number[]): number => (nums.length === 0 ? 0 : Math.round(nums.reduce((s, n) => s + n, 0) / nums.length));

/** Category score lookup that tolerates missing/partial evaluation payloads. */
function categoryScore(categories: Record<string, EvaluationCategory>, key: EvaluationCategoryKey): number | null {
  const c = categories[key];
  return c && typeof c.score === 'number' ? c.score : null;
}

/**
 * Aggregates dashboard cards/charts (§10) from stored sessions, questions and evaluations.
 * Pure and deterministic so it can be unit tested without a database.
 */
export function computeDashboardMetrics(input: MetricsInput): DashboardMetrics {
  const completed = input.sessions.filter((s) => s.status === 'ended' || s.endedAt != null);
  if (input.sessions.length === 0) return { ...EMPTY_DASHBOARD_METRICS };

  const answered = input.questions.filter((q) => q.latencyMs != null);

  const byCategory = new Map<QuestionCategory, number>();
  for (const q of input.questions) byCategory.set(q.category, (byCategory.get(q.category) ?? 0) + 1);
  const questionsByCategory = [...byCategory.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const overallScores = input.evaluations.map((e) => e.overallScore);
  const techScores = input.evaluations.map((e) => categoryScore(e.categories, 'technical_knowledge')).filter((n): n is number => n != null);
  const commScores = input.evaluations.map((e) => categoryScore(e.categories, 'communication')).filter((n): n is number => n != null);
  const confScores = input.evaluations.map((e) => categoryScore(e.categories, 'confidence')).filter((n): n is number => n != null);

  const sessionStart = new Map(input.sessions.map((s) => [s.id, s.startedAt.slice(0, 10)]));
  const byDay = new Map<string, number[]>();
  for (const e of input.evaluations) {
    const day = sessionStart.get(e.sessionId);
    if (!day) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), e.overallScore]);
  }
  const performanceOverTime = [...byDay.entries()]
    .map(([date, scores]) => ({ date, score: avg(scores) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const perCategoryTotals = new Map<EvaluationCategoryKey, number[]>();
  for (const e of input.evaluations) {
    for (const [key, value] of Object.entries(e.categories)) {
      if (!value || typeof value.score !== 'number') continue;
      const k = key as EvaluationCategoryKey;
      perCategoryTotals.set(k, [...(perCategoryTotals.get(k) ?? []), value.score]);
    }
  }
  const weakAreas = [...perCategoryTotals.entries()]
    .map(([key, scores]) => ({ category: EVALUATION_CATEGORY_LABELS[key] ?? key, score: avg(scores) }))
    .filter((c) => c.score < 70)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const buckets = [
    { label: '< 1s', test: (v: number) => v < 1000 },
    { label: '1-3s', test: (v: number) => v >= 1000 && v < 3000 },
    { label: '3-5s', test: (v: number) => v >= 3000 && v < 5000 },
    { label: '5-10s', test: (v: number) => v >= 5000 && v < 10000 },
    { label: '> 10s', test: (v: number) => v >= 10000 },
  ];
  const responseLatency = buckets.map((b) => ({
    bucket: b.label,
    count: answered.filter((q) => b.test(q.latencyMs ?? 0)).length,
  }));

  const responseQuality = avg(overallScores);
  const communication = avg(commScores);
  const answeredRatio = input.questions.length === 0 ? 0 : Math.round((answered.length / input.questions.length) * 100);
  const volumeScore = Math.min(100, completed.length * 10);
  const interviewReadiness = Math.round(
    responseQuality * 0.5 + (communication || responseQuality) * 0.25 + (answeredRatio * 0.15) + volumeScore * 0.1,
  );

  return {
    sessionsCompleted: completed.length,
    questionsAnswered: answered.length,
    averageResponseQuality: responseQuality,
    technicalScore: avg(techScores),
    communicationScore: communication,
    confidenceScore: avg(confScores),
    questionsByCategory,
    performanceOverTime,
    weakAreas,
    responseLatency,
    interviewReadiness,
  };
}