import { describe, expect, it } from 'vitest';
import { parseStructuredAnswer } from '../src/ai/structured.js';
import { TemplateProvider } from '../src/ai/providers.js';
import { classifyQuestion, shouldTriggerAI, CircuitBreaker, withRetry } from '@ai-assistant/shared';

process.env.NODE_ENV = 'test';

const sampleAnswer = {
  transcript: '...',
  detectedQuestion: { question: 'Tell me about a challenge?', category: 'behavioral' as const, confidence: 0.9, detectedAt: new Date().toISOString(), context: '' },
  conversationHistory: [],
  interviewMode: 'behavioral' as const,
  answerMode: 'star' as const,
};

describe('question pipeline', () => {
  it('classifies categories and debounces fragments', () => {
    expect(classifyQuestion('Tell me about a time you resolved a conflict?')?.category).toBe('behavioral');
    expect(classifyQuestion('How would you design a URL shortener for 100M users?')?.category).toBe('system_design');
    expect(classifyQuestion('What is the time complexity of quicksort?')?.category).toBe('coding');
    expect(classifyQuestion('hi')).toBeNull();
    expect(shouldTriggerAI('hello', 2000)).toBe(false);
    expect(shouldTriggerAI('Can you explain how you would design a cache?', 800)).toBe(true);
  });

  it('template provider answers per mode and streams', async () => {
    const provider = new TemplateProvider();
    const star = await provider.generateAnswer(sampleAnswer);
    expect(star.answer).toMatch(/Situation/);
    expect(star.keyPoints.length).toBeGreaterThan(0);
    let streamed = '';
    for await (const chunk of provider.generateStreamingAnswer(sampleAnswer)) streamed += chunk;
    expect(streamed).toBe(star.answer);
  });

  it('parses structured model output and survives malformed output', () => {
    const parsed = parseStructuredAnswer('ANSWER:\nSay it clearly.\nKEY POINTS:\n- One\n- Two\nFOLLOW UPS:\n- Why?');
    expect(parsed.answer).toBe('Say it clearly.');
    expect(parsed.keyPoints).toEqual(['One', 'Two']);
    expect(parsed.followUpQuestions).toEqual(['Why?']);
    const fallback = parseStructuredAnswer('Just an answer, no sections.');
    expect(fallback.answer).toContain('Just an answer');
    const empty = parseStructuredAnswer('');
    expect(empty.answer).toBe('No answer returned.');
  });

  it('circuit breaker opens after threshold; withRetry recovers', async () => {
    const breaker = new CircuitBreaker(2, 100000);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe('open');
    expect(breaker.canExecute()).toBe(false);

    let attempts = 0;
    const value = await withRetry(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('flaky');
      return 'ok';
    }, { baseMs: 1 });
    expect(value).toBe('ok');
  });
});