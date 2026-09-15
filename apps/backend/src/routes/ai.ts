import type { FastifyInstance } from 'fastify';
import { aiEvaluateSchema, aiQuestionSchema, aiSummarizeSchema } from '@ai-assistant/shared';
import { estimateTokens, TemplateProvider } from '../ai/providers.js';
import { providerDescriptors, resolveProviderForUser } from '../ai/registry.js';
import type { AIProvider } from '../ai/types.js';
import { serverMetrics } from '../observability/metrics.js';
import { audit, badRequest, clientIp, notFound, ownedSession, parseInput, repo, requireUser } from '../http/helpers.js';

/** Records AI usage (§17) without ever storing prompt, transcript or audio content. */
async function recordAiUsage(
  db: Awaited<ReturnType<typeof repo>>,
  userId: string,
  provider: AIProvider,
  tokens: number,
): Promise<void> {
  serverMetrics.recordAiRequest(tokens);
  await db.addUsageEvent({
    userId,
    eventType: 'ai.request',
    metadata: { provider: provider.name, kind: provider.kind, tokens },
  }).catch(() => undefined);
}

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ai/providers', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const [settings, privacy, stored] = await Promise.all([
      db.getSettings(userId),
      db.getPrivacy(userId),
      db.listProviders(userId),
    ]);
    return {
      available: providerDescriptors(),
      configured: stored.map((p) => ({ provider: p.provider, model: p.model, baseUrl: p.baseUrl, isDefault: p.isDefault })),
      defaultProvider: settings.defaultProvider,
      cloudAiEnabled: privacy.cloudAi,
    };
  });

  app.post('/ai/question', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(aiQuestionSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();

    let resumeContext = parsed.data.resumeContext;
    let jobDescription = parsed.data.jobDescription;
    if (parsed.data.sessionId) {
      const session = await ownedSession(db, parsed.data.sessionId, userId);
      if (!session) return notFound(reply, 'Session');
      if (session.resumeId && !resumeContext) {
        const resume = await db.getResume(session.resumeId);
        if (resume) resumeContext = resume.content.slice(0, 8000);
      }
      if (session.jobDescriptionId && !jobDescription) {
        const jd = await db.getJobDescription(session.jobDescriptionId);
        if (jd) jobDescription = jd.content.slice(0, 8000);
      }
    }

    const input = {
      transcript: parsed.data.transcript,
      detectedQuestion: {
        question: parsed.data.question,
        category: parsed.data.category,
        confidence: 1,
        detectedAt: new Date().toISOString(),
        context: parsed.data.transcript.slice(-500),
      },
      conversationHistory: parsed.data.conversationHistory,
      screenContext: parsed.data.screenContext,
      resumeContext,
      jobDescription,
      interviewMode: parsed.data.interviewMode,
      answerMode: parsed.data.answerMode,
    };

    const provider = await resolveProviderForUser(db, userId);

    if (parsed.data.stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const send = (payload: unknown): void => {
        if (!reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      let answer = '';
      try {
        send({ type: 'ai.started', provider: provider.name });
        for await (const token of provider.generateStreamingAnswer(input)) {
          answer += token;
          send({ type: 'ai.streaming', token });
        }
        send({ type: 'ai.completed', answer });
      } catch (error) {
        send({ type: 'ai.error', error: error instanceof Error ? error.message : 'AI provider failed' });
      } finally {
        send('[DONE]');
        reply.raw.end();
      }
      await recordAiUsage(db, userId, provider, estimateTokens(answer));
      return reply;
    }

    let answer;
    let usedProvider = provider.name;
    let degraded = false;
    try {
      answer = await provider.generateAnswer(input);
    } catch (error) {
      // §16: never fail the session because a provider is down — degrade locally.
      app.log.warn({ err: error }, 'AI provider failed, using local fallback');
      answer = await new TemplateProvider().generateAnswer(input);
      usedProvider = 'template-local';
      degraded = true;
    }

    await recordAiUsage(db, userId, degraded ? new TemplateProvider() : provider, estimateTokens(answer.answer));

    let storedAnswer = null;
    if (parsed.data.sessionId && parsed.data.questionId) {
      const session = await ownedSession(db, parsed.data.sessionId, userId);
      if (session) {
        storedAnswer = await db.upsertAnswer({
          questionId: parsed.data.questionId,
          text: answer.answer,
          keyPoints: answer.keyPoints,
          latencyMs: answer.latencyMs,
          provider: usedProvider,
        });
      }
    }
    await audit(db, userId, 'ai.answer', parsed.data.sessionId ?? 'ad-hoc', clientIp(req));
    return { ...answer, provider: usedProvider, degraded, storedAnswer };
  });

  app.post('/ai/evaluate', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(aiEvaluateSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const provider = await resolveProviderForUser(db, userId);
    const feedback = await provider.evaluateAnswer(parsed.data.answer, parsed.data.question);
    await recordAiUsage(db, userId, provider, estimateTokens(parsed.data.answer));
    return { provider: provider.name, question: parsed.data.question, ...feedback };
  });

  app.post('/ai/summarize', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(aiSummarizeSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const provider = await resolveProviderForUser(db, userId);
    const summary = await provider.summarizeSession(parsed.data.transcript);
    await recordAiUsage(db, userId, provider, estimateTokens(parsed.data.transcript));
    return { provider: provider.name, ...summary };
  });

  app.post('/ai/classify', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const body = (req.body ?? {}) as { text?: string };
    if (!body.text || body.text.trim().length < 5) return reply.code(400).send({ error: 'text is required' });
    const db = await repo();
    const provider = await resolveProviderForUser(db, userId);
    const category = await provider.classifyQuestion(body.text.slice(0, 2000));
    return { category, provider: provider.name };
  });

  /** Server-side speech-to-text for users who prefer not to hold keys on the desktop. */
  app.post('/ai/transcribe', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const body = (req.body ?? {}) as { audioBase64?: string; sampleRate?: number; language?: string };
    if (!body.audioBase64) return reply.code(400).send({ error: 'audioBase64 is required (16-bit mono PCM)' });
    const db = await repo();
    const privacy = await db.getPrivacy(userId);
    if (!privacy.cloudTranscription) {
      return reply.code(409).send({ error: 'Cloud transcription is disabled in your privacy settings' });
    }
    const provider = await resolveProviderForUser(db, userId);
    const buffer = Buffer.from(body.audioBase64, 'base64');
    if (buffer.byteLength === 0 || buffer.byteLength > 12 * 1024 * 1024) {
      return reply.code(400).send({ error: 'Audio chunk must be between 1 byte and 12 MB' });
    }
    try {
      const sampleRate = body.sampleRate ?? 16000;
      const audio = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      const text = await provider.transcribeAudio(audio, { sampleRate, language: body.language });
      const seconds = buffer.byteLength / 2 / sampleRate;
      serverMetrics.recordTranscription(seconds);
      await db.addUsageEvent({
        userId,
        eventType: 'transcription.audio',
        metadata: { seconds: Math.round(seconds * 10) / 10, provider: provider.name },
      });
      return { text, provider: provider.name, durationSeconds: Math.round(seconds * 10) / 10 };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : 'Transcription provider unavailable' });
    }
  });
}