import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { auth, db } from '../firebase/admin';
import { COLLECTIONS } from '../shared/constants';
import { env } from '../config/env';
import { AppError, toAppError } from '../utils/errors';
import { createLogger, type Logger } from '../utils/logger';
import { safeEqual } from '../utils/crypto';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    log: Logger;
    user?: { uid: string; email?: string };
  }
}

const rootLog = createLogger('http');

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.log = rootLog.child({ requestId: req.requestId });
  res.setHeader('x-request-id', req.requestId);
  const start = Date.now();
  res.on('finish', () => {
    req.log.info('request', { method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Date.now() - start, userId: req.user?.uid });
  });
  next();
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new AppError('UNAUTHENTICATED', 'Missing bearer token', 401);
    const decoded = await auth.verifyIdToken(token).catch((e: { code?: string }) => {
      const expired = e?.code === 'auth/id-token-expired';
      throw new AppError('UNAUTHENTICATED', expired ? 'Your session expired. Sign in again.' : 'Invalid authentication token', 401);
    });
    req.user = { uid: decoded.uid, email: decoded.email };
    req.log = req.log.child({ userId: decoded.uid });
    const ref = db.collection(COLLECTIONS.users).doc(decoded.uid);
    const now = new Date().toISOString();
    const snap = await ref.get();
    await ref.set(
      {
        userId: decoded.uid,
        email: decoded.email ?? '',
        displayName: decoded.name ?? '',
        photoUrl: decoded.picture ?? '',
        lastLoginAt: now,
        ...(snap.exists && snap.data()?.createdAt ? {} : { createdAt: now }),
      },
      { merge: true },
    );
    next();
  } catch (e) {
    next(e);
  }
}

export const uid = (req: Request): string => {
  if (!req.user) throw new AppError('UNAUTHENTICATED', 'Not authenticated', 401);
  return req.user.uid;
};

/** Shared-secret guard for n8n -> backend internal calls. */
export function requireInternal(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.header('x-internal-secret') ?? '';
  if (!provided || !safeEqual(provided, env.INTERNAL_API_SECRET)) {
    return next(new AppError('UNAUTHENTICATED', 'Invalid internal credentials', 401));
  }
  next();
}

/** Shared-secret check for callbacks from n8n. Header: x-aca-secret. */
export function requireWebhookSecret(req: Request, _res: Response, next: NextFunction): void {
  if (!env.N8N_WEBHOOK_SECRET) return next(new AppError('CONFIG_MISSING', 'N8N_WEBHOOK_SECRET is not configured', 503));
  const provided = req.header('x-aca-secret') ?? '';
  if (!provided || !safeEqual(provided, env.N8N_WEBHOOK_SECRET)) {
    return next(new AppError('UNAUTHENTICATED', 'Invalid webhook secret', 401));
  }
  next();
}

export function validate<S extends ZodTypeAny>(schema: S, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError('VALIDATION_ERROR', 'Request validation failed', 400, formatZod(result.error)));
    }
    (req as unknown as Record<string, unknown>)[`valid_${source}`] = result.data;
    next();
  };
}

export function valid<S extends ZodTypeAny>(req: Request, source: 'body' | 'query' | 'params' = 'body'): z.infer<S> {
  return (req as unknown as Record<string, unknown>)[`valid_${source}`] as z.infer<S>;
}

function formatZod(e: ZodError) {
  return e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', 'Too many requests. Try again shortly.', 429)),
});

export const aiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AI_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid ?? req.ip ?? 'anon',
  handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', 'Too many AI requests. Wait a minute and try again.', 429)),
});

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', 'Route not found', 404));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const e = toAppError(err);
  const log = req.log ?? rootLog;
  if (e.status >= 500) log.error('request failed', err);
  else log.warn('request rejected', { code: e.code, message: e.message });
  const hide = e.status >= 500 && env.NODE_ENV === 'production' && e.code === 'INTERNAL_ERROR';
  res.status(e.status).json({
    error: { code: e.code, message: hide ? 'Something went wrong' : e.message, details: e.details, requestId: req.requestId },
  });
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
