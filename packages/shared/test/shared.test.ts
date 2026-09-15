import { describe, it, expect } from 'vitest';
import { classifyQuestion, shouldTriggerAI } from '../src/question.js';
import { CircuitBreaker, withRetry } from '../src/resilience.js';

describe('question', () => {
  it('classifies categories', () => {
    expect(classifyQuestion('Tell me about a time you led a project?')?.category).toBe('behavioral');
    expect(classifyQuestion('How would you design a URL shortener for 100M users?')?.category).toBe('system_design');
    expect(classifyQuestion('What is the time complexity of quicksort?')?.category).toBe('coding');
    expect(classifyQuestion('hi') ).toBeNull();
    expect(classifyQuestion('I worked on a notification platform for two years') ).toBeNull();
  });
  it('debounces AI triggers', () => {
    expect(shouldTriggerAI('hello', 2000)).toBe(false);
    expect(shouldTriggerAI('Can you explain your approach?', 800)).toBe(true);
  });
});

describe('resilience', () => {
  it('retries then succeeds', async () => {
    let n = 0;
    const v = await withRetry(async () => (++n < 3 ? Promise.reject(new Error('x')) : Promise.resolve('ok')), { baseMs: 1 });
    expect(v).toBe('ok');
  });
  it('circuit opens', () => {
    const cb = new CircuitBreaker(2, 60000);
    cb.recordFailure(); cb.recordFailure();
    expect(cb.canExecute()).toBe(false);
  });
});
