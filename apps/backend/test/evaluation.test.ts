import { describe, expect, it } from 'vitest';
import { evaluateSession } from '../src/services/evaluation.js';
import { computeDashboardMetrics } from '../src/services/metrics.js';

process.env.NODE_ENV = 'test';

describe('evaluation engine', () => {
  it('scores a strong behavioural session highly and an empty one at zero', () => {
    const strong = evaluateSession({
      mode: 'behavioral',
      durationMs: 600000,
      transcripts: [{ speaker: 'candidate', text: 'I led the migration...' }],
      questions: [{ text: 'Tell me about a challenge?', category: 'behavioral', confidence: 0.9 }],
      answers: [{
        text: 'Situation: the migration was at risk. Task: I owned the cutover. Action: first I staged it, then I monitored latency, and finally we cut traffic. Result: incidents dropped 40%.',
        keyPoints: ['owned', 'staged', 'monitored'], latencyMs: 4000,
      }],
    });
    expect(strong.overallScore).toBeGreaterThan(50);
    expect(strong.topImprovements.length).toBeGreaterThan(0);
    expect(strong.nextPractice).toContain('Behavioral');

    const empty = evaluateSession({ mode: 'mock', durationMs: 0, transcripts: [], questions: [], answers: [] });
    expect(empty.overallScore).toBe(0);
    expect(empty.categories.technical_knowledge.weaknesses).toContain('Not assessed in this session');
    expect(empty.topImprovements).toHaveLength(3);
  });
});

describe('dashboard metrics', () => {
  it('aggregates cards and charts from stored data', () => {
    const metrics = computeDashboardMetrics({
      sessions: [
        { id: 'a', startedAt: '2026-09-01T10:00:00.000Z', endedAt: '2026-09-01T10:20:00.000Z', status: 'ended', score: 80 },
        { id: 'b', startedAt: '2026-09-02T10:00:00.000Z', endedAt: null, status: 'active', score: null },
      ],
      questions: [
        { category: 'behavioral', detectedAt: '2026-09-01T10:05:00.000Z', latencyMs: 2500 },
        { category: 'coding', detectedAt: '2026-09-02T10:05:00.000Z', latencyMs: null },
      ],
      evaluations: [{
        sessionId: 'a',
        overallScore: 80,
        categories: { communication: { score: 85, strengths: [], weaknesses: [], recommendations: [] } },
      }],
    });
    expect(metrics.sessionsCompleted).toBe(1);
    expect(metrics.questionsAnswered).toBe(1);
    expect(metrics.communicationScore).toBe(85);
    expect(metrics.questionsByCategory[0]).toEqual({ category: 'behavioral', count: 1 });
    expect(metrics.performanceOverTime).toEqual([{ date: '2026-09-01', score: 80 }]);
  });
});