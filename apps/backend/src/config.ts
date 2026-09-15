import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WS_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional(),
  REQUIRE_DATABASE: z.enum(['true', 'false']).default('false'),
  MIGRATIONS_DIR: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  AI_DEFAULT_PROVIDER: z.string().default('template'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MODEL: z.string().optional(),
  GOOGLE_BASE_URL: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),
  OLLAMA_MODEL: z.string().optional(),
  OPENAI_COMPAT_BASE_URL: z.string().optional(),
  OPENAI_COMPAT_API_KEY: z.string().optional(),
  OPENAI_COMPAT_MODEL: z.string().optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
}

const env = parsed.data;

/** Production refuses to boot with dev-grade secrets (§13). */
function requireProductionSecrets(): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (!env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < 32) problems.push('JWT_ACCESS_SECRET must be set to at least 32 characters');
  if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET.length < 32) problems.push('JWT_REFRESH_SECRET must be set to at least 32 characters');
  if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length < 32) problems.push('ENCRYPTION_KEY must be set to at least 32 characters');
  if (!env.DATABASE_URL) problems.push('DATABASE_URL is required in production');
  return problems;
}

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  wsPort: env.WS_PORT,
  corsOrigin: env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  databaseUrl: env.DATABASE_URL,
  requireDatabase: env.REQUIRE_DATABASE === 'true',
  migrationsDir: env.MIGRATIONS_DIR,
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    refreshSecret: env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    accessTtl: '15m' as const,
    refreshTtlDays: 14,
  },
  aiTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  version: '0.2.0',
} as const;

export function validateConfig(): void {
  const problems = requireProductionSecrets();
  if (problems.length > 0) throw new Error(`Unsafe production configuration:\n - ${problems.join('\n - ')}`);
}