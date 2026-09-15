import type { UsageSummary } from '@ai-assistant/shared';
import type { UsageEventRecord } from './types.js';

/** Single source of truth for usage metering (§17) used by every repository driver. */
export function summarizeUsage(events: { eventType: string; metadata: Record<string, unknown> }[]): UsageSummary {
  const num = (meta: Record<string, unknown>, key: string): number => {
    const v = meta[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };
  const summary: UsageSummary = {
    sessions: 0, questionsAnswered: 0, aiRequests: 0, aiTokens: 0,
    transcriptionMinutes: 0, audioMinutes: 0, screenCaptures: 0,
  };
  for (const e of events) {
    switch (e.eventType) {
      case 'session.started': summary.sessions += 1; break;
      case 'question.detected': summary.questionsAnswered += 1; break;
      case 'ai.request':
        summary.aiRequests += 1;
        summary.aiTokens += num(e.metadata, 'tokens');
        break;
      case 'transcription.audio':
        summary.transcriptionMinutes += num(e.metadata, 'seconds') / 60;
        summary.audioMinutes += num(e.metadata, 'seconds') / 60;
        break;
      case 'screen.capture': summary.screenCaptures += 1; break;
      default: break;
    }
  }
  summary.transcriptionMinutes = Math.round(summary.transcriptionMinutes * 10) / 10;
  summary.audioMinutes = Math.round(summary.audioMinutes * 10) / 10;
  return summary;
}

export function summarizeUsageFromRecords(events: UsageEventRecord[]): UsageSummary {
  return summarizeUsage(events.map((e) => ({ eventType: e.eventType, metadata: e.metadata })));
}

/** Export shape strips credential/key material so the file is safe to store. */
async function userProfile(
  repo: { findPublicUserById(id: string): Promise<{ id: string; email: string; createdAt: string } | null> },
  userId: string,
): Promise<{ id: string; email: string; createdAt: string } | null> {
  return repo.findPublicUserById(userId);
}

/** Account data export (§13) — deliberately excludes password hashes and key material. */
export async function buildUserExport(
  repo: {
    findPublicUserById(id: string): Promise<{ id: string; email: string; createdAt: string } | null>;
    listAllSessions(id: string): Promise<unknown[]>;
    listTranscripts(id: string): Promise<unknown[]>;
    listQuestionsForUser(id: string): Promise<unknown[]>;
    listEvaluationsForUser(id: string): Promise<unknown[]>;
    listResumes(id: string): Promise<{ id: string; filename: string; parsed: unknown; uploadedAt: string }[]>;
    listJobDescriptions(id: string): Promise<unknown[]>;
    getSettings(id: string): Promise<unknown>;
    getPrivacy(id: string): Promise<unknown>;
    aggregateUsage(id: string, days: number): Promise<UsageSummary>;
    listAuditLogs(id: string, limit: number): Promise<unknown[]>;
  },
  userId: string,
): Promise<Record<string, unknown>> {
  const sessions = (await repo.listAllSessions(userId)) as { id: string }[];
  const transcripts: unknown[] = [];
  for (const s of sessions) transcripts.push(...(await repo.listTranscripts(s.id)));
  return {
    exportedAt: new Date().toISOString(),
    user: await userProfile(repo, userId),
    sessions,
    transcripts,
    questions: await repo.listQuestionsForUser(userId),
    evaluations: await repo.listEvaluationsForUser(userId),
    resumes: (await repo.listResumes(userId)).map((r) => ({ id: r.id, filename: r.filename, parsed: r.parsed, uploadedAt: r.uploadedAt })),
    jobDescriptions: await repo.listJobDescriptions(userId),
    settings: await repo.getSettings(userId),
    privacy: await repo.getPrivacy(userId),
    usage: await repo.aggregateUsage(userId, 3650),
    auditLogs: await repo.listAuditLogs(userId, 500),
  };
}