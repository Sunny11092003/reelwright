import { AppError } from './errors';

export interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(url: string, opts: FetchJsonOptions = {}): Promise<Response> {
  const { timeoutMs = 30_000, ...init } = opts;
  return fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
}

export async function readJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError('NETWORK_FAILURE', `Unexpected non-JSON response (HTTP ${res.status})`, 502, text.slice(0, 200), res.status >= 500);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: { retries?: number; baseMs?: number; shouldRetry?: (e: unknown) => boolean } = {}): Promise<T> {
  const { retries = 2, baseMs = 800, shouldRetry = (e) => e instanceof AppError && e.retryable } = opts;
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn(i);
    } catch (e) {
      last = e;
      if (i === retries || !shouldRetry(e)) throw e;
      await sleep(baseMs * 2 ** i);
    }
  }
  throw last;
}
