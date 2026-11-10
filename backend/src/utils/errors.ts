export type ErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT'
  | 'RATE_LIMITED' | 'AI_FAILURE' | 'AI_INVALID_OUTPUT' | 'AI_UNSUPPORTED'
  | 'CLOUDINARY_FAILURE' | 'INVALID_VIDEO' | 'META_API_ERROR' | 'META_TOKEN_EXPIRED'
  | 'META_RATE_LIMIT' | 'WORDPRESS_ERROR' | 'WORDPRESS_AUTH' | 'N8N_UNAVAILABLE'
  | 'N8N_REJECTED' | 'NETWORK_FAILURE' | 'CONFIG_MISSING' | 'ACCOUNT_NOT_CONNECTED'
  | 'CONTENT_NOT_READY' | 'PLATFORM_REQUIREMENT' | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 500,
    public readonly details?: unknown,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (m: string, details?: unknown) => new AppError('VALIDATION_ERROR', m, 400, details);
export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} was not found`, 404);
export const forbidden = (m = 'You do not have access to this resource') => new AppError('FORBIDDEN', m, 403);

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    const cause = (err as { cause?: { code?: string } }).cause;
    const code = cause?.code ?? '';
    if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT'].includes(code) || err.name === 'TimeoutError') {
      return new AppError('NETWORK_FAILURE', `Network request failed: ${err.message}`, 502, undefined, true);
    }
    return new AppError('INTERNAL_ERROR', err.message, 500);
  }
  return new AppError('INTERNAL_ERROR', 'Unknown error', 500);
}
