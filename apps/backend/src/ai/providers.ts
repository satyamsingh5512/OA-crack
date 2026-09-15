import { classifyQuestion as classifyLocally, CircuitBreaker, withRetry } from '@ai-assistant/shared';
import type { AnswerInput, AnswerOutput, QuestionCategory } from '@ai-assistant/shared';
import { config } from '../config.js';
import type { AIProvider, EvaluationFeedback, Summary, TranscribeOptions } from './types.js';
import { buildPrompt } from './types.js';
import { parseStructuredAnswer, structuredAnswerInstructions } from './structured.js';
import { estimateTokens, pcm16MonoToWav } from './wav.js';

/**
 * Deterministic offline provider. Used when no key is configured, when the user
 * disables cloud AI, and as the graceful-degradation fallback (§16).
 */
export class TemplateProvider implements AIProvider {
  readonly name = 'template-local';
  readonly kind = 'local' as const;
  private breaker = new CircuitBreaker();

  async complete(prompt: string): Promise<string> {
    return `Local provider active — no cloud model is configured. Prompt length: ${prompt.length} characters.`;
  }

  async generateAnswer(input: AnswerInput): Promise<AnswerOutput> {
    if (!this.breaker.canExecute()) throw new Error('AI temporarily unavailable (circuit open)');
    const started = Date.now();
    try {
      const composed = this.compose(input);
      this.breaker.recordSuccess();
      return { ...composed, latencyMs: Date.now() - started };
    } catch (error) {
      this.breaker.recordFailure();
      throw error;
    }
  }

  async *generateStreamingAnswer(input: AnswerInput): AsyncIterable<string> {
    const { answer } = await this.generateAnswer(input);
    for (const chunk of answer.match(/[\s\S]{1,48}/g) ?? []) yield chunk;
  }

  async summarizeSession(transcript: string): Promise<Summary> {
    const questions = transcript.split('\n').filter((line) => line.trim().endsWith('?')).slice(0, 5);
    const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
    return {
      summary: `Local summary: ${wordCount} words of dialogue captured. Configure a cloud provider for a narrative summary.`,
      keyMoments: questions.length > 0 ? questions : ['Opening', 'Deep-dive', 'Closing'],
    };
  }

  async classifyQuestion(text: string): Promise<QuestionCategory> {
    return classifyLocally(text)?.category ?? 'other';
  }

  async evaluateAnswer(answer: string, question?: string): Promise<EvaluationFeedback> {
    const words = answer.trim().split(/\s+/).filter(Boolean).length;
    const structured = /\b(first|then|finally|result|because)\b/i.test(answer);
    const score = Math.min(95, 45 + Math.min(words, 160) / 4 + (structured ? 10 : 0));
    return {
      score: Math.round(score),
      feedback: [
        words < 40 ? 'Too short — add context and a result.' : 'Length is workable.',
        structured ? 'Good use of structure markers.' : 'Add ordering words (first/then/finally) so the interviewer can follow.',
        question ? `Ties back to: "${question.slice(0, 80)}"` : '',
      ].filter(Boolean).join(' '),
    };
  }

  async transcribeAudio(): Promise<string> {
    throw new Error('Local template provider cannot transcribe audio — configure a speech-to-text provider');
  }

  private compose(input: AnswerInput): Omit<AnswerOutput, 'latencyMs'> {
    const question = input.detectedQuestion.question;
    const category = input.detectedQuestion.category;
    let answer: string;
    let keyPoints: string[];

    if (input.answerMode === 'star' || category === 'behavioral') {
      answer = `Situation: on a recent project relevant to "${question.slice(0, 80)}" we had a tight deadline with a reliability risk. Task: I owned the fix end to end. Action: I broke the work into small shippable steps, added metrics, and coordinated reviews. Result: we shipped on time with fewer incidents, and I documented the follow-ups.`;
      keyPoints = ['Situation: tight deadline + reliability risk', 'Action: incremental shipping + metrics', 'Result: on-time delivery, fewer incidents'];
    } else if (input.answerMode === 'coding' || category === 'coding') {
      answer = 'Understanding: restate inputs, outputs, and constraints. Approach: start with a brute force, then optimise with a hash map or two pointers. Complexity: aim for O(n) time and O(n) space, and state the tradeoff. Implementation: write it cleanly with helper functions. Edge cases: empty input, duplicates, overflow.';
      keyPoints = ['Clarify constraints first', 'Brute force → optimised', 'State O(n) time/space and edge cases'];
    } else if (input.answerMode === 'system_design' || category === 'system_design') {
      answer = 'Requirements: clarify functional and scale targets. Architecture: API gateway → stateless services → managed database plus cache and queue. Data flow: the write path is validated and queued, the read path is cached. Scaling: horizontal services, read replicas, sharding only when needed. Reliability and security: retries with idempotency, TLS everywhere, least-privilege access. Tradeoffs: consistency versus latency stated explicitly.';
      keyPoints = ['Requirements + assumptions first', 'Gateway / services / DB / cache / queue', 'Tradeoffs stated explicitly'];
    } else {
      answer = `Great question — "${question.slice(0, 120)}". Short version: I have direct experience here; I would lead with the outcome, then the two or three decisions that drove it, and close with what I would do next. Happy to go deeper on any part.`;
      keyPoints = ['Lead with the outcome', 'Two or three key decisions', 'Close with the next step'];
    }

    return {
      answer,
      keyPoints,
      confidence: 0.72,
      reasoningSummary: `Local template for ${category}/${input.answerMode}. Configure an AI provider for grounded, personalised answers.`,
      followUpQuestions: ['Can you share a concrete metric from that work?'],
      citations: [],
    };
  }
}

export interface OpenAICompatibleOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  label?: string;
  /** Speech-to-text model for /audio/transcriptions (Whisper-compatible endpoints). */
  transcriptionModel?: string;
  timeoutMs?: number;
}

/**
 * Adapter for every OpenAI-compatible HTTP API: OpenAI, Anthropic's and Google's
 * compatibility layers, Groq (also exposes Whisper), Ollama, vLLM, LM Studio…
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  readonly kind: 'cloud' | 'local';
  private breaker = new CircuitBreaker();
  private readonly timeoutMs: number;

  constructor(private readonly opts: OpenAICompatibleOptions) {
    this.name = opts.label ?? 'openai-compatible';
    this.kind = /localhost|127\.0\.0\.1|ollama/.test(opts.baseURL) ? 'local' : 'cloud';
    this.timeoutMs = opts.timeoutMs ?? config.aiTimeoutMs;
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.opts.apiKey}` };
  }

  /** Single-turn completion with retry + circuit breaker + hard timeout. */
  async complete(prompt: string): Promise<string> {
    if (!this.breaker.canExecute()) throw new Error(`AI temporarily unavailable (${this.name} circuit open)`);
    try {
      const res = await withRetry(() => fetch(`${this.opts.baseURL}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.opts.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
        }),
      }), { timeoutMs: this.timeoutMs });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`AI provider error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
      }
      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      this.breaker.recordSuccess();
      return data.choices?.[0]?.message?.content?.trim() ?? '';
    } catch (error) {
      this.breaker.recordFailure();
      throw error;
    }
  }

  async generateAnswer(input: AnswerInput): Promise<AnswerOutput> {
    const started = Date.now();
    const raw = await this.complete(`${buildPrompt(input)}\n\n${structuredAnswerInstructions()}`);
    const parsed = parseStructuredAnswer(raw);
    return {
      answer: parsed.answer,
      keyPoints: parsed.keyPoints,
      confidence: parsed.keyPoints.length > 0 ? 0.85 : 0.6,
      reasoningSummary: `Generated by ${this.name} (${this.opts.model}). Structure checked against the requested answer style.`,
      followUpQuestions: parsed.followUpQuestions,
      citations: [],
      latencyMs: Date.now() - started,
    };
  }

  async *generateStreamingAnswer(input: AnswerInput): AsyncIterable<string> {
    if (!this.breaker.canExecute()) {
      yield (await new TemplateProvider().generateAnswer(input)).answer;
      return;
    }
    const res = await withRetry(() => fetch(`${this.opts.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.opts.model,
        stream: true,
        temperature: 0.4,
        messages: [{ role: 'user', content: `${buildPrompt(input)}\n\n${structuredAnswerInstructions()}` }],
      }),
    }), { timeoutMs: this.timeoutMs });

    if (!res.ok || !res.body) {
      // Graceful degradation: stream the deterministic local answer instead of failing (§16).
      yield (await new TemplateProvider().generateAnswer(input)).answer;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim().split('\n').pop() ?? '';
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') { this.breaker.recordSuccess(); return; }
        try {
          const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const token = json.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch { /* keep streaming through malformed frames */ }
      }
    }
    this.breaker.recordSuccess();
  }

  async summarizeSession(transcript: string): Promise<Summary> {
    const raw = await this.complete([
      'You summarise interview practice sessions for the candidate.',
      'Reply in exactly this format:',
      'SUMMARY:',
      '<3-4 sentences>',
      'KEY MOMENTS:',
      '- <moment>',
      `Transcript:\n${transcript.slice(0, 12000)}`,
    ].join('\n'));
    const summary = raw.match(/SUMMARY:\s*([\s\S]*?)(?:\n\s*KEY MOMENTS:|$)/i)?.[1]?.trim();
    const momentsBlock = raw.match(/KEY MOMENTS:([\s\S]*)$/i)?.[1] ?? '';
    const keyMoments = momentsBlock
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
    return { summary: summary || raw.trim(), keyMoments };
  }

  async classifyQuestion(text: string): Promise<QuestionCategory> {
    const local = classifyLocally(text)?.category;
    if (local) return local;
    try {
      const raw = await this.complete([
        'Classify the interview question into exactly one label:',
        'behavioral, technical, coding, system_design, database, networking, project, resume, hr, follow_up, clarification, other.',
        'Reply with the label only.',
        `Question: ${text.slice(0, 500)}`,
      ].join('\n'));
      const label = raw.trim().toLowerCase().replace(/[^a-z_]/g, '');
      return classifyLocally(label)?.category ?? 'other';
    } catch {
      return 'other';
    }
  }

  async evaluateAnswer(answer: string, question?: string): Promise<EvaluationFeedback> {
    try {
      const raw = await this.complete([
        'Score this interview answer from 0-100 on clarity, structure and specificity.',
        'Reply exactly as:',
        'SCORE: <number>',
        'FEEDBACK: <one or two sentences>',
        question ? `Question: ${question}` : '',
        `Answer: ${answer.slice(0, 4000)}`,
      ].filter(Boolean).join('\n'));
      const score = Number(raw.match(/SCORE:\s*(\d{1,3})/i)?.[1]);
      if (!Number.isFinite(score)) throw new Error('Unparseable score');
      const feedback = raw.match(/FEEDBACK:\s*([\s\S]*)$/i)?.[1]?.trim();
      return { score: Math.max(0, Math.min(100, Math.round(score))), feedback: feedback || 'No feedback returned.' };
    } catch {
      return new TemplateProvider().evaluateAnswer(answer, question);
    }
  }

  /** Accepts raw 16-bit mono PCM (desktop default) or an audio container. */
  async transcribeAudio(audio: ArrayBuffer, opts: TranscribeOptions = {}): Promise<string> {
    const model = opts.model ?? this.opts.transcriptionModel;
    if (!model) throw new Error(`Provider ${this.name} has no transcription model configured`);
    const bytes = new Uint8Array(audio);
    const isRiff = bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const payload = isRiff ? bytes : pcm16MonoToWav(bytes, opts.sampleRate ?? 16000);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(payload)], { type: 'audio/wav' }), 'chunk.wav');
    form.append('model', model);
    if (opts.language) form.append('language', opts.language);

    const res = await withRetry(() => fetch(`${this.opts.baseURL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.opts.apiKey}` },
      body: form,
    }), { timeoutMs: this.timeoutMs });
    if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
    const data = await res.json() as { text?: string };
    return data.text?.trim() ?? '';
  }
}

export { estimateTokens };