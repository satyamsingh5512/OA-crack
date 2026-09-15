export async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseMs?: number; timeoutMs?: number } = {}): Promise<T> {
  const { retries = 3, baseMs = 1000, timeoutMs = 30000 } = opts;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (e) {
      last = e;
      if (attempt === retries) break;
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw last;
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  constructor(private threshold = 5, private halfOpenMs = 30000) {}
  canExecute(): boolean {
    if (this.failures < this.threshold) return true;
    return Date.now() - this.openedAt > this.halfOpenMs;
  }
  recordSuccess(): void { this.failures = 0; }
  recordFailure(): void { this.failures++; if (this.failures >= this.threshold) this.openedAt = Date.now(); }
  get state(): 'closed' | 'open' | 'half-open' {
    if (this.failures < this.threshold) return 'closed';
    return Date.now() - this.openedAt > this.halfOpenMs ? 'half-open' : 'open';
  }
}
