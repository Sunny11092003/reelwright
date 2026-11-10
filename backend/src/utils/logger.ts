import pino from 'pino';
import { env } from '../config/env';

const base = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      '*.password', '*.applicationPassword', '*.accessToken', '*.access_token', '*.token',
      '*.refreshToken', '*.apiKey', '*.secret', '*.authorization', '*.headers.authorization',
      '*.headers["x-internal-secret"]', '*.headers["x-aca-signature"]', 'password',
      'applicationPassword', 'accessToken', 'access_token', 'token', 'apiKey', 'secret',
    ],
    censor: '[REDACTED]',
  },
});

export interface LogContext {
  requestId?: string;
  userId?: string;
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown> | unknown): void;
  child(ctx: LogContext): Logger;
}

function serializeErr(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    const anyE = e as Error & { code?: string };
    return { error: { name: e.name, message: e.message, code: anyE.code, stack: env.NODE_ENV === 'production' ? undefined : e.stack } };
  }
  if (e && typeof e === 'object') return e as Record<string, unknown>;
  return e === undefined ? {} : { error: String(e) };
}

export function createLogger(service: string, ctx: LogContext = {}): Logger {
  const l = base.child({ service, ...ctx });
  return {
    debug: (m, x) => l.debug(x ?? {}, m),
    info: (m, x) => l.info(x ?? {}, m),
    warn: (m, x) => l.warn(x ?? {}, m),
    error: (m, x) => l.error(serializeErr(x), m),
    child: (c) => createLogger(service, { ...ctx, ...c }),
  };
}
