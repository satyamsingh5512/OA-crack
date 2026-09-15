import { WebSocketServer, type WebSocket } from 'ws';
import {
  sessionEventSchema, wsClientMessageSchema,
  type QuestionCategory, type SessionEvent, type Speaker,
} from '@ai-assistant/shared';
import { verifyAccess } from '../auth.js';
import { getRepository } from '../db/index.js';
import { serverMetrics } from '../observability/metrics.js';

interface ClientState {
  userId: string | null;
  subscriptions: Set<string>;
  lastPong: number;
  authenticated: boolean;
}

const clients = new Map<WebSocket, ClientState>();
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_MESSAGE_BYTES = 64 * 1024;

export function getWsConnectionCount(): number {
  return clients.size;
}

/**
 * Authenticated realtime layer (§15).
 *
 * Clients must first send `{ type: 'auth', token }`, then subscribe to sessions
 * they own. Events in the shared `session.event` envelope are validated with
 * zod, broadcast to other subscribers of the same session, and persisted when
 * they carry transcript/question/answer data. Clients behind NAT or on flaky
 * Wi-Fi re-authenticate on reconnect and resubscribe — buffered events on the
 * desktop side are replayed (§16).
 */
export function attachRealtime(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    const state: ClientState = { userId: null, subscriptions: new Set(), lastPong: Date.now(), authenticated: false };
    clients.set(ws, state);
    serverMetrics.incrementWsConnections(1);

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      if (Buffer.byteLength(String(raw)) > MAX_MESSAGE_BYTES) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return; // ignore malformed frames; the client gets no acknowledgement
      }
      const msg = wsClientMessageSchema.safeParse(parsed);
      if (!msg.success) return;
      void handleMessage(ws, state, msg.data).catch(() => undefined);
    });

    const cleanup = (): void => {
      if (clients.delete(ws)) serverMetrics.incrementWsConnections(-1);
      try { ws.terminate(); } catch { /* already closed */ }
    };
    ws.on('close', cleanup);
    ws.on('error', () => undefined);
  });

  const heartbeat = setInterval(() => {
    for (const [ws, state] of clients) {
      if (Date.now() - state.lastPong > HEARTBEAT_INTERVAL_MS * 2) {
        try { ws.terminate(); } catch { /* ignore */ }
        continue;
      }
      send(ws, { type: 'ping' });
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  return wss;
}

type ClientMessage = ReturnType<typeof wsClientMessageSchema.parse>;

async function handleMessage(ws: WebSocket, state: ClientState, msg: ClientMessage): Promise<void> {
  switch (msg.type) {
    case 'auth': {
      const userId = verifyAccess(msg.token);
      if (!userId) {
        send(ws, { type: 'auth.rejected', error: 'Invalid or expired token' });
        ws.close(4401, 'unauthorised');
        return;
      }
      state.userId = userId;
      state.authenticated = true;
      state.lastPong = Date.now();
      send(ws, { type: 'auth.accepted' });
      return;
    }
    case 'ping': {
      state.lastPong = Date.now();
      send(ws, { type: 'pong' });
      return;
    }
    case 'session.subscribe': {
      if (!state.authenticated || !state.userId) return send(ws, { type: 'error', error: 'Authenticate first' });
      const db = await getRepository();
      const session = await db.getSession(msg.sessionId);
      if (!session || session.userId !== state.userId) return send(ws, { type: 'error', error: 'Session not found' });
      state.subscriptions.add(msg.sessionId);
      return send(ws, { type: 'session.subscribed', sessionId: msg.sessionId });
    }
    case 'session.unsubscribe': {
      state.subscriptions.delete(msg.sessionId);
      return send(ws, { type: 'session.unsubscribed', sessionId: msg.sessionId });
    }
    case 'session.event': {
      if (!state.authenticated || !state.userId) return send(ws, { type: 'error', error: 'Authenticate first' });
      if (!state.subscriptions.has(msg.sessionId)) return send(ws, { type: 'error', error: 'Not subscribed to session' });
      const validated = sessionEventSchema.safeParse(msg.event);
      if (!validated.success) return send(ws, { type: 'error', error: 'Invalid event payload' });
      await persistEvent(state.userId, msg.sessionId, validated.data).catch(() => undefined);
      broadcast(validated.data as SessionEvent, ws, msg.sessionId);
      return send(ws, { type: 'event.ack' });
    }
    default:
      return;
  }
}

/** Transcript/question/answer events are durably recorded; playback events are not. */
async function persistEvent(userId: string, sessionId: string, event: Record<string, unknown>): Promise<void> {
  const db = await getRepository();
  const session = await db.getSession(sessionId);
  if (!session || session.userId !== userId || session.status === 'ended') return;

  if (event.type === 'transcript.final') {
    await db.addTranscript(sessionId, {
      speaker: event.speaker as Speaker,
      text: String(event.text),
      timestamp: typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString(),
    });
    return;
  }
  if (event.type === 'question.detected') {
    const question = (event.question ?? {}) as { question?: string; category?: string; confidence?: number; detectedAt?: string; context?: string };
    if (!question.question) return;
    await db.addQuestion(sessionId, {
      question: question.question,
      category: (question.category ?? 'other') as QuestionCategory,
      confidence: typeof question.confidence === 'number' ? question.confidence : 0.5,
      detectedAt: typeof question.detectedAt === 'string' ? question.detectedAt : new Date().toISOString(),
      context: typeof question.context === 'string' ? question.context : '',
    });
    await db.addUsageEvent({ userId, eventType: 'question.detected', metadata: { category: question.category ?? 'other', via: 'ws' } });
    return;
  }
  if (event.type === 'ai.completed') {
    const answer = (event.answer ?? {}) as { answer?: string; keyPoints?: unknown; latencyMs?: number };
    const questionId = typeof event.questionId === 'string' ? event.questionId : null;
    if (questionId) {
      await db.upsertAnswer({
        questionId,
        text: String(answer.answer ?? ''),
        keyPoints: Array.isArray(answer.keyPoints) ? answer.keyPoints.map(String) : [],
        latencyMs: Number.isFinite(answer.latencyMs) ? Math.round(Number(answer.latencyMs)) : 0,
        provider: 'realtime',
      });
    }
  }
}

function broadcast(event: SessionEvent, except: WebSocket | null, sessionId: string): void {
  const message = JSON.stringify({ type: 'session.event', sessionId, event });
  for (const [ws, state] of clients) {
    if (ws === except || ws.readyState !== 1 || !state.authenticated) continue;
    // Session-scoped events go only to subscribers; device changes are global.
    if (event.type === 'device.changed' || state.subscriptions.has(sessionId)) {
      try { ws.send(message); } catch { /* drop slow clients */ }
    }
  }
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== 1) return;
  try { ws.send(JSON.stringify(payload)); } catch { /* ignore */ }
}