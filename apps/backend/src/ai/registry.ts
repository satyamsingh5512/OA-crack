import { decryptSecret } from '../security/crypto.js';
import type { Repository } from '../db/types.js';
import type { AIProvider } from './types.js';
import { OpenAICompatibleProvider, TemplateProvider } from './providers.js';

export interface ProviderDescriptor {
  id: string;
  label: string;
  kind: 'cloud' | 'local';
  configured: boolean;
  supportsTranscription: boolean;
}

export interface ProviderConfig {
  id: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

interface ProviderPreset {
  label: string;
  baseUrl: string;
  model?: string;
  transcriptionModel?: string;
  kind: 'cloud' | 'local';
  openAiCompatible: boolean;
}

/** Presets for the providers named in the spec (§3.4) + Groq for low-latency STT. */
export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', transcriptionModel: 'whisper-1', kind: 'cloud', openAiCompatible: true },
  anthropic: { label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest', kind: 'cloud', openAiCompatible: true },
  google: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', kind: 'cloud', openAiCompatible: true },
  groq: { label: 'Groq (Whisper + Llama)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', transcriptionModel: 'whisper-large-v3-turbo', kind: 'cloud', openAiCompatible: true },
  ollama: { label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', kind: 'local', openAiCompatible: true },
  'openai-compatible': { label: 'Custom OpenAI-compatible', baseUrl: '', model: 'default', kind: 'local', openAiCompatible: true },
  deepgram: { label: 'Deepgram (STT only)', baseUrl: 'https://api.deepgram.com/v1', kind: 'cloud', openAiCompatible: false },
  'local-whisper': { label: 'Local Whisper (desktop STT)', baseUrl: '', kind: 'local', openAiCompatible: false },
};

const ENV_KEYS: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GOOGLE_API_KEY'],
  groq: ['GROQ_API_KEY'],
  ollama: ['OLLAMA_BASE_URL'],
  'openai-compatible': ['OPENAI_COMPAT_API_KEY'],
  deepgram: ['DEEPGRAM_API_KEY'],
};

/** Which providers this deployment could use right now (drives the /providers UI). */
export function providerDescriptors(): ProviderDescriptor[] {
  return Object.entries(PROVIDER_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label,
    kind: preset.kind,
    configured: (ENV_KEYS[id] ?? []).some((key) => Boolean(process.env[key])),
    supportsTranscription: preset.transcriptionModel != null || id === 'deepgram' || id === 'local-whisper',
  }));
}

/** Builds a concrete adapter for a provider id + credentials. */
export function buildProvider(cfg: ProviderConfig): AIProvider {
  const preset = PROVIDER_PRESETS[cfg.id];
  if (!preset) throw new Error(`Unknown AI provider: ${cfg.id}`);
  if (!preset.openAiCompatible) {
    throw new Error(`${preset.label} is configured for speech-to-text only; choose an OpenAI-compatible chat provider`);
  }
  const baseUrl = (cfg.baseUrl && cfg.baseUrl.length > 0 ? cfg.baseUrl : preset.baseUrl).replace(/\/$/, '');
  if (baseUrl.length === 0) throw new Error(`Provider ${cfg.id} requires a base URL`);
  return new OpenAICompatibleProvider({
    baseURL: baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model ?? preset.model ?? 'default',
    label: cfg.id,
    transcriptionModel: preset.transcriptionModel,
  });
}

/** Deployment-level provider from environment variables (never hard-coded keys). */
export function createProviderFromEnv(): AIProvider {
  const preferred = (process.env.AI_DEFAULT_PROVIDER ?? 'template').toLowerCase();
  const envCredentials: Record<string, { apiKey?: string; baseUrl?: string; model?: string }> = {
    openai: { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY, baseUrl: process.env.ANTHROPIC_BASE_URL, model: process.env.ANTHROPIC_MODEL },
    google: { apiKey: process.env.GOOGLE_API_KEY, baseUrl: process.env.GOOGLE_BASE_URL, model: process.env.GOOGLE_MODEL },
    groq: { apiKey: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL },
    ollama: { apiKey: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL, model: process.env.OLLAMA_MODEL },
    'openai-compatible': {
      apiKey: process.env.OPENAI_COMPAT_API_KEY,
      baseUrl: process.env.OPENAI_COMPAT_BASE_URL,
      model: process.env.OPENAI_COMPAT_MODEL,
    },
  };

  const attempt = (id: string): AIProvider | null => {
    const preset = PROVIDER_PRESETS[id];
    const creds = envCredentials[id];
    if (!preset || !creds) return null;
    const needsKey = !preset.openAiCompatible ? false : id !== 'ollama';
    if (needsKey && !creds.apiKey) return null;
    if (id === 'openai-compatible' && !creds.baseUrl) return null;
    if (id === 'ollama' && !creds.baseUrl) return null;
    try {
      return buildProvider({ id, apiKey: creds.apiKey ?? 'none', baseUrl: creds.baseUrl, model: creds.model });
    } catch {
      return null;
    }
  };

  return attempt(preferred) ?? attempt('openai') ?? attempt('anthropic') ?? attempt('google') ?? attempt('groq') ?? attempt('ollama') ?? new TemplateProvider();
}

/**
 * Per-user provider resolution.
 * Order: privacy switch → user's default provider (decrypted key) → env default → offline template.
 * A user with "Cloud AI" disabled never reaches a cloud adapter.
 */
export async function resolveProviderForUser(db: Repository, userId: string): Promise<AIProvider> {
  const privacy = await db.getPrivacy(userId);
  if (!privacy.cloudAi) return new TemplateProvider();

  const settings = await db.getSettings(userId);
  const preferred = settings.defaultProvider;
  if (preferred) {
    const stored = await db.getProvider(userId, preferred);
    if (stored) {
      try {
        return buildProvider({
          id: stored.provider,
          apiKey: decryptSecret(stored.encryptedApiKey),
          baseUrl: stored.baseUrl ?? undefined,
          model: stored.model ?? undefined,
        });
      } catch {
        // Undecryptable or revoked key: fall through to the environment default.
      }
    }
  }
  return createProviderFromEnv();
}

/** Provider used when a cloud call must be replaced by a local fallback (§16). */
export function localFallbackProvider(): AIProvider {
  return new TemplateProvider();
}