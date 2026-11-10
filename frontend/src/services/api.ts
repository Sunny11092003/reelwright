import { API_BASE, auth } from '../config/firebase';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public requestId?: string, public details?: unknown) {
    super(message);
  }
}

async function token(force = false): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new ApiError('UNAUTHENTICATED', 'You are signed out. Sign in again.', 401);
  return u.getIdToken(force);
}

export async function api<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await token(retried)}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('NETWORK_FAILURE', 'Cannot reach the server. Check your connection and that the backend is running.', 0);
  }
  if (res.status === 401 && !retried) return api<T>(method, path, body, true);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; requestId?: string; details?: unknown } } | null)?.error;
    throw new ApiError(err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (HTTP ${res.status})`, res.status, err?.requestId, err?.details);
  }
  return json as T;
}

export const get = <T,>(p: string) => api<T>('GET', p);
export const post = <T,>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const put = <T,>(p: string, b: unknown) => api<T>('PUT', p, b);
export const del = <T = void,>(p: string) => api<T>('DELETE', p);

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong';
}
