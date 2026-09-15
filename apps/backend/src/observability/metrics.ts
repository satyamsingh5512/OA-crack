import type { MetricsSnapshot } from '@ai-assistant/shared';

/**
 * In-process backend metrics (§17): request count, error rate, p95 latency,
 * WebSocket connections, AI/transcription usage. Never records prompts,
 * transcripts, audio or screen data.
 */
export class ServerMetrics {
  private startedAt = Date.now();
  private latencies: number[] = [];
  requests = 0;
  errors = 0;
  aiRequests = 0;
  aiTokens = 0;
  transcriptionSeconds = 0;
  wsConnections = 0;

  recordRequest(durationMs: number, isError: boolean): void {
    this.requests += 1;
    if (isError) this.errors += 1;
    this.latencies.push(durationMs);
    if (this.latencies.length > 5000) this.latencies.shift();
  }

  recordAiRequest(tokens: number): void {
    this.aiRequests += 1;
    this.aiTokens += Number.isFinite(tokens) ? tokens : 0;
  }

  recordTranscription(seconds: number): void {
    this.transcriptionSeconds += Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  }

  incrementWsConnections(delta: number): void {
    this.wsConnections = Math.max(0, this.wsConnections + delta);
  }

  p95(): number {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    return Math.round(sorted[Math.max(0, idx)]);
  }

  snapshot(extra: { dbHealthy: boolean; dbDriver: 'postgres' | 'memory' }): MetricsSnapshot {
    return {
      uptimeMs: Date.now() - this.startedAt,
      requests: this.requests,
      errors: this.errors,
      errorRate: this.requests === 0 ? 0 : Math.round((this.errors / this.requests) * 10_000) / 100,
      p95LatencyMs: this.p95(),
      wsConnections: this.wsConnections,
      dbHealthy: extra.dbHealthy,
      dbDriver: extra.dbDriver,
      aiRequests: this.aiRequests,
      transcriptionMinutes: Math.round((this.transcriptionSeconds / 60) * 10) / 10,
    };
  }

  reset(): void {
    this.startedAt = Date.now();
    this.latencies = [];
    this.requests = 0;
    this.errors = 0;
    this.aiRequests = 0;
    this.aiTokens = 0;
    this.transcriptionSeconds = 0;
    this.wsConnections = 0;
  }
}

/** Process-wide metrics instance shared by routes and the realtime server. */
export const serverMetrics = new ServerMetrics();