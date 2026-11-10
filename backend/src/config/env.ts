import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  FRONTEND_URL: z.string().url(),
  BACKEND_PUBLIC_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().default(''),

  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default('ai-content-agent'),
  MAX_UPLOAD_MB: z.coerce.number().default(100),

  AI_DEFAULT_PROVIDER: z.enum(['gemini', 'anthropic']).default('gemini'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v21.0'),

  N8N_BASE_URL: z.string().url().optional(),
  N8N_WEBHOOK_PATH_PREFIX: z.string().default('/webhook/aca'),
  N8N_WEBHOOK_SECRET: z.string().min(16).optional(),
  INTERNAL_API_SECRET: z.string().min(24),
  DEFAULT_EXECUTION_MODE: z.enum(['n8n', 'direct']).default('direct'),

  SESSION_SECRET: z.string().min(24),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(240),
  AI_RATE_LIMIT_MAX: z.coerce.number().default(30),
  ALLOW_PRIVATE_WORDPRESS_HOSTS: bool,
  RUN_INTERNAL_SCHEDULER: bool,

  GA4_PROPERTY_ID: z.string().optional(),
  GA4_CLIENT_EMAIL: z.string().optional(),
  GA4_PRIVATE_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example and docs/SETUP.md.`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export function requireEnv<K extends keyof Env>(key: K, feature: string): NonNullable<Env[K]> {
  const v = env[key];
  if (v === undefined || v === null || v === '') {
    throw new Error(`${String(key)} is not set. It is required for ${feature}. See docs/SETUP.md.`);
  }
  return v as NonNullable<Env[K]>;
}
