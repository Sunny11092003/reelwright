import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { fetchWithTimeout, readJson } from '../../utils/http';

export const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

interface GraphErrorBody {
  error?: { message: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string; error_user_msg?: string };
}

export function mapGraphError(status: number, body: GraphErrorBody): AppError {
  const e = body.error;
  const msg = e?.error_user_msg ?? e?.message ?? `Meta API request failed (HTTP ${status})`;
  const code = e?.code;
  const trace = e?.fbtrace_id ? ` (trace ${e.fbtrace_id})` : '';
  if (code === 190 || e?.type === 'OAuthException' && [458, 459, 460, 463, 467].includes(e?.error_subcode ?? 0)) {
    return new AppError('META_TOKEN_EXPIRED', `Meta access token expired or was revoked. Reconnect the account. ${msg}${trace}`, 401);
  }
  if ([4, 17, 32, 613, 80001, 80002, 80006].includes(code ?? -1)) {
    return new AppError('META_RATE_LIMIT', `Meta rate limit reached. ${msg}${trace}`, 429, undefined, true);
  }
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) {
    return new AppError('META_API_ERROR', `Meta permission problem: ${msg}${trace}`, 403, { code });
  }
  return new AppError('META_API_ERROR', `${msg}${trace}`, status >= 500 ? 502 : 400, { code, subcode: e?.error_subcode }, status >= 500 || code === 1 || code === 2);
}

export async function graph<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  accessToken?: string,
  timeoutMs = 60_000,
): Promise<T> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) search.set(k, String(v));
  if (accessToken) search.set('access_token', accessToken);
  const url = path.startsWith('http') ? path : `${GRAPH}${path}`;
  const init: RequestInit & { timeoutMs: number } = { method, timeoutMs };
  let target = url;
  if (method === 'GET' || method === 'DELETE') target = `${url}?${search.toString()}`;
  else {
    init.headers = { 'content-type': 'application/x-www-form-urlencoded' };
    init.body = search.toString();
  }
  const res = await fetchWithTimeout(target, init);
  const body = await readJson<T & GraphErrorBody>(res);
  if (!res.ok || (body as GraphErrorBody).error) throw mapGraphError(res.status, body as GraphErrorBody);
  return body;
}
