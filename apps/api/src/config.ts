import { z } from 'zod';

/**
 * Environment parsing, validated once at boot.
 *
 * Failing to start on bad configuration is intentional: a privacy product that
 * silently falls back to a permissive default (an unlimited upload size, a
 * wildcard CORS origin) is worse than one that refuses to run.
 */
const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  // Vite prints http://127.0.0.1:5173; browsers treat that as a different origin
  // from http://localhost:5173, so both must be allowed in local development.
  API_CORS_ORIGINS: z.string().default('http://127.0.0.1:5173,http://localhost:5173'),

  UPLOAD_MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(200 * 1024 * 1024)
    .default(10 * 1024 * 1024),
  UPLOAD_MAX_FILES: z.coerce.number().int().positive().max(1).default(1),
  UPLOAD_MAX_COMPRESSION_RATIO: z.coerce.number().int().positive().default(120),

  SESSION_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(900),
  SESSION_MAX_ENTRIES: z.coerce.number().int().positive().default(50),

  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  SANITIZATION_STRICT_VERIFICATION: booleanFromEnv.default(true),

  /**
   * When true, Fastify trusts `X-Forwarded-*` (required behind Vercel) and CORS
   * reflects the request Origin so preview URLs work without a fixed allow-list.
   */
  API_TRUST_PROXY: booleanFromEnv.default(false),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type Environment = z.infer<typeof environmentSchema>;

export interface AppConfig {
  readonly env: Environment;
  readonly isProduction: boolean;
  readonly corsOrigins: readonly string[];
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration -> ${issues}`);
  }

  const env = parsed.data;
  const corsOrigins = env.API_CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (env.NODE_ENV === 'production' && corsOrigins.includes('*')) {
    throw new Error('API_CORS_ORIGINS must not be "*" in production.');
  }

  return {
    env,
    isProduction: env.NODE_ENV === 'production',
    corsOrigins,
  };
}
