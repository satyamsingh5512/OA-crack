import type { AnswerInput, AnswerOutput, QuestionCategory } from '@ai-assistant/shared';

export interface Summary { summary: string; keyMoments: string[] }

export interface TranscribeOptions {
  /** Sample rate of the raw PCM input when `audio` is not already a container. */
  sampleRate?: number;
  model?: string;
  language?: string;
}

export interface EvaluationFeedback { score: number; feedback: string }

/**
 * Provider-independent AI contract (§3.4 / AI abstraction in the spec).
 * Adapters: template (offline), any OpenAI-compatible endpoint (OpenAI,
 * Anthropic compatibility layer, Gemini compatibility layer, Groq, Ollama, self-hosted).
 */
export interface AIProvider {
  readonly name: string;
  readonly kind: 'cloud' | 'local';
  /** Raw single-turn completion used by summarise/classify/evaluate helpers. */
  complete(prompt: string): Promise<string>;
  generateAnswer(input: AnswerInput): Promise<AnswerOutput>;
  generateStreamingAnswer(input: AnswerInput): AsyncIterable<string>;
  summarizeSession(transcript: string): Promise<Summary>;
  classifyQuestion(text: string): Promise<QuestionCategory>;
  evaluateAnswer(answer: string, question?: string): Promise<EvaluationFeedback>;
  transcribeAudio(audio: ArrayBuffer, opts?: TranscribeOptions): Promise<string>;
}

/** Shared prompt builder so every provider receives identical grounding. */
export function buildPrompt(input: AnswerInput): string {
  const modeGuides: Record<string, string> = {
    star: 'Structure the answer as Situation / Task / Action / Result.',
    coding: 'Structure as Understanding / Approach / Complexity / Implementation / Edge Cases.',
    system_design: 'Structure as Requirements / Assumptions / Architecture / Components / Data Flow / Scaling / Reliability / Security / Tradeoffs.',
    concise: 'Be concise: 4-6 sentences plus 3 key points.',
    detailed: 'Give a thorough but interview-paced answer.',
    technical: 'Be precise and technical with concrete details and tradeoffs.',
    executive: 'Be crisp and business-impact focused.',
  };
  const history = input.conversationHistory.slice(-8).map((t) => `${t.speaker}: ${t.text.slice(0, 400)}`).join('\n');
  return [
    `Interview mode: ${input.interviewMode}. Answer style: ${input.answerMode}.`,
    modeGuides[input.answerMode] ?? '',
    `Detected question [${input.detectedQuestion.category}, confidence ${input.detectedQuestion.confidence.toFixed(2)}]: ${input.detectedQuestion.question}`,
    history ? `Recent conversation:\n${history}` : '',
    `Live transcript excerpt: ${input.transcript.slice(-2000)}`,
    input.resumeContext ? `Candidate resume (use only facts that appear here): ${input.resumeContext.slice(0, 2000)}` : '',
    input.jobDescription ? `Target job description: ${input.jobDescription.slice(0, 2000)}` : '',
    input.screenContext ? `Screen context: ${input.screenContext.slice(0, 2000)}` : '',
    'Write the answer in the first person, ready to say out loud.',
  ].filter(Boolean).join('\n');
}
