import { describe, expect, it, beforeEach } from 'vitest';
import { buildServer } from '../src/index.js';
import { setRepository } from '../src/db/index.js';
import { MemoryRepository } from '../src/db/memory.js';

process.env.NODE_ENV = 'test';

const headers = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

async function authed() {
  const app = await buildServer();
  const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: `s${Date.now()}${Math.random()}@example.com`, password: 'password123' } });
  return { app, token: (reg.json() as { accessToken: string }).accessToken };
}

describe('session lifecycle', () => {
  beforeEach(() => setRepository(new MemoryRepository()));

  it('create → transcript → question → answer → end (with evaluation) → detail', async () => {
    const { app, token } = await authed();
    const auth = headers(token);

    const created = await app.inject({ method: 'POST', url: '/sessions', payload: { mode: 'behavioral' }, headers: auth });
    expect(created.statusCode).toBe(200);
    const session = created.json().session as { id: string; status: string };

    // A second session cannot start while one is active.
    expect((await app.inject({ method: 'POST', url: '/sessions', payload: { mode: 'coding' }, headers: auth })).statusCode).toBe(409);

    const t1 = await app.inject({
      method: 'POST', url: `/sessions/${session.id}/transcripts`, headers: auth,
      payload: { speaker: 'candidate', text: 'I led the notification platform migration and cut incidents by 40%.' },
    });
    expect(t1.statusCode).toBe(200);

    const q1 = await app.inject({
      method: 'POST', url: `/sessions/${session.id}/questions`, headers: auth,
      payload: { text: 'Tell me about a time you led a project?', category: 'behavioral', confidence: 0.9, context: 'opening' },
    });
    expect(q1.statusCode).toBe(200);
    const question = q1.json().question as { id: string };

    const ai = await app.inject({
      method: 'POST', url: '/ai/question', headers: auth,
      payload: {
        transcript: 'Tell me about a time you led a project?',
        question: 'Tell me about a time you led a project?',
        category: 'behavioral',
        interviewMode: 'behavioral',
        answerMode: 'star',
      },
    });
    expect(ai.statusCode).toBe(200);
    expect(ai.json()).toHaveProperty('answer');
    expect(ai.json().provider).toBe('template-local');

    const a1 = await app.inject({
      method: 'POST', url: `/sessions/${session.id}/answers`, headers: auth,
      payload: { questionId: question.id, text: ai.json().answer, keyPoints: ['owned it'], latencyMs: 3200, provider: 'template-local' },
    });
    expect(a1.statusCode).toBe(200);

    const paused = await app.inject({ method: 'POST', url: `/sessions/${session.id}/pause`, headers: auth });
    expect(paused.json().session.status).toBe('paused');
    const resumed = await app.inject({ method: 'POST', url: `/sessions/${session.id}/resume`, headers: auth });
    expect(resumed.json().session.status).toBe('active');

    const ended = await app.inject({ method: 'POST', url: `/sessions/${session.id}/end`, headers: auth });
    expect(ended.statusCode).toBe(200);
    const evaluation = ended.json().evaluation;
    expect(evaluation).toMatchObject({ overallScore: expect.any(Number) });
    expect(evaluation.categories.behavioral_responses.weaknesses).not.toContain('Not assessed in this session');
    expect(evaluation.categories.system_design.weaknesses).toContain('Not assessed in this session');
    expect(evaluation.topImprovements.length).toBeGreaterThan(0);
    expect(evaluation.nextPractice).toContain('Behavioral Interview');

    const detail = await app.inject({ method: 'GET', url: `/sessions/${session.id}`, headers: auth });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().transcripts).toHaveLength(1);
    expect(detail.json().questions[0].answer).toHaveProperty('text');
    expect(detail.json().evaluation).toHaveProperty('overallScore');
  });

  it('prevents cross-user access and validates ownership', async () => {
    const first = await authed();
    const second = await authed();
    const created = await first.app.inject({ method: 'POST', url: '/sessions', payload: { mode: 'mock' }, headers: headers(first.token) });
    const id = (created.json().session as { id: string }).id;

    expect((await second.app.inject({ method: 'GET', url: `/sessions/${id}`, headers: headers(second.token) })).statusCode).toBe(404);
    expect((await second.app.inject({ method: 'POST', url: `/sessions/${id}/end`, headers: headers(second.token) })).statusCode).toBe(404);

    const list = await first.app.inject({ method: 'GET', url: '/sessions?limit=10&offset=0', headers: headers(first.token) });
    expect(list.json().sessions).toHaveLength(1);

    const deleted = await first.app.inject({ method: 'DELETE', url: `/sessions/${id}`, headers: headers(first.token) });
    expect(deleted.statusCode).toBe(200);
    expect((await first.app.inject({ method: 'GET', url: `/sessions/${id}`, headers: headers(first.token) })).statusCode).toBe(404);
  });
});