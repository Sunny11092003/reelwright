import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { fetchWithTimeout, readJson } from '../../utils/http';

export interface WpCredentials {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
}

/** SSRF guard: only public http(s) hosts, unless ALLOW_PRIVATE_WORDPRESS_HOSTS=true (local dev). */
export async function normalizeSiteUrl(raw: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Enter a valid WordPress site URL, for example https://example.com', 400);
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new AppError('VALIDATION_ERROR', 'The site URL must start with http:// or https://', 400);
  if (env.NODE_ENV === 'production' && u.protocol !== 'https:' && !env.ALLOW_PRIVATE_WORDPRESS_HOSTS) {
    throw new AppError('VALIDATION_ERROR', 'Use https:// for your WordPress site in production', 400);
  }
  if (!env.ALLOW_PRIVATE_WORDPRESS_HOSTS) {
    const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true }).catch(() => []);
    if (addrs.length === 0) throw new AppError('VALIDATION_ERROR', `Could not resolve ${u.hostname}`, 400);
    if (addrs.some((a) => isPrivateIp(a.address))) throw new AppError('VALIDATION_ERROR', 'Private or local network addresses are not allowed for WordPress sites', 400);
  }
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

const auth = (c: WpCredentials) => `Basic ${Buffer.from(`${c.username}:${c.applicationPassword.replace(/\s+/g, '')}`).toString('base64')}`;

interface WpErrorBody { code?: string; message?: string; data?: { status?: number } }

async function wp<T>(c: WpCredentials, path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ body: T; headers: Headers }> {
  const url = `${c.siteUrl}/wp-json${path}`;
  const res = await fetchWithTimeout(url, { ...init, headers: { authorization: auth(c), accept: 'application/json', ...(init.headers ?? {}) }, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) {
    throw new AppError('WORDPRESS_ERROR', `The site redirected the REST request (${res.status}). Use the final site URL (check http vs https and www).`, 502);
  }
  const body = await readJson<T & WpErrorBody>(res);
  if (!res.ok) {
    const b = body as WpErrorBody;
    if (res.status === 401 || res.status === 403) {
      throw new AppError('WORDPRESS_AUTH', `WordPress rejected the credentials: ${b.message ?? 'unauthorized'}. Create a new Application Password and reconnect.`, 401);
    }
    if (res.status === 404 && b.code === 'rest_no_route') throw new AppError('WORDPRESS_ERROR', 'WordPress REST API route not found. Enable pretty permalinks and check the site URL.', 502);
    throw new AppError('WORDPRESS_ERROR', b.message ?? `WordPress returned HTTP ${res.status}`, res.status >= 500 ? 502 : 400, b, res.status >= 500);
  }
  return { body: body as T, headers: res.headers };
}

export async function testConnection(c: WpCredentials): Promise<{ id: number; name: string; canPublish: boolean; siteName: string }> {
  const { body: me } = await wp<{ id: number; name: string; capabilities?: Record<string, boolean> }>(c, '/wp/v2/users/me?context=edit', { timeoutMs: 20_000 });
  const root = await fetchWithTimeout(`${c.siteUrl}/wp-json/`, { timeoutMs: 20_000 }).then((r) => readJson<{ name?: string }>(r)).catch(() => ({ name: undefined as string | undefined }));
  const canPublish = me.capabilities ? Boolean(me.capabilities.publish_posts) : true;
  return { id: me.id, name: me.name, canPublish, siteName: root.name ?? new URL(c.siteUrl).hostname };
}

export async function uploadMedia(c: WpCredentials, data: Buffer, filename: string, mimeType: string, altText: string, title: string): Promise<{ id: number; url: string }> {
  const { body } = await wp<{ id: number; source_url: string }>(c, '/wp/v2/media', {
    method: 'POST',
    headers: { 'content-disposition': `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`, 'content-type': mimeType },
    body: data,
    timeoutMs: 120_000,
  });
  await wp(c, `/wp/v2/media/${body.id}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alt_text: altText, title }),
  }).catch(() => undefined);
  return { id: body.id, url: body.source_url };
}

async function ensureTerms(c: WpCredentials, taxonomy: 'categories' | 'tags', names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names.map((n) => n.trim()).filter(Boolean).slice(0, 10)) {
    const { body: found } = await wp<{ id: number; name: string }[]>(c, `/wp/v2/${taxonomy}?search=${encodeURIComponent(name)}&per_page=20`);
    const exact = found.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (exact) { ids.push(exact.id); continue; }
    try {
      const { body } = await wp<{ id: number }>(c, `/wp/v2/${taxonomy}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      ids.push(body.id);
    } catch (e) {
      // term may exist (term_exists) when search misses; ignore and continue without it
      if (!(e instanceof AppError) || e.code === 'WORDPRESS_AUTH') throw e;
    }
  }
  return ids;
}

export interface WpPostInput {
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  status: 'publish' | 'draft';
  categories: string[];
  tags: string[];
  featuredMediaId?: number;
  meta?: Record<string, string>;
}

export async function createPost(c: WpCredentials, p: WpPostInput): Promise<{ id: number; link: string; status: string }> {
  const [categories, tags] = await Promise.all([ensureTerms(c, 'categories', p.categories), ensureTerms(c, 'tags', p.tags)]);
  const payload: Record<string, unknown> = {
    title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.contentHtml, status: p.status, categories, tags,
    ...(p.featuredMediaId ? { featured_media: p.featuredMediaId } : {}),
    ...(p.meta && Object.keys(p.meta).length ? { meta: p.meta } : {}),
  };
  const { body } = await wp<{ id: number; link: string; status: string }>(c, '/wp/v2/posts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), timeoutMs: 60_000,
  });
  return body;
}
