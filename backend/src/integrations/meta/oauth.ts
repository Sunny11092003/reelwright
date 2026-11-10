import jwt from 'jsonwebtoken';
import { env, requireEnv } from '../../config/env';
import { AppError } from '../../utils/errors';
import { graph } from './graph';

export const META_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_metadata',
  'read_insights', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_insights',
  'business_management',
];

export const redirectUri = () => `${env.BACKEND_PUBLIC_URL.replace(/\/$/, '')}/api/accounts/callback/meta`;

export function createState(userId: string): string {
  return jwt.sign({ uid: userId, purpose: 'meta-oauth' }, env.SESSION_SECRET, { expiresIn: '10m' });
}

export function verifyState(state: string): string {
  try {
    const p = jwt.verify(state, env.SESSION_SECRET) as { uid: string; purpose: string };
    if (p.purpose !== 'meta-oauth') throw new Error('bad purpose');
    return p.uid;
  } catch {
    throw new AppError('UNAUTHENTICATED', 'The connection request expired. Start the connection again.', 400);
  }
}

export function authUrl(userId: string): string {
  const appId = requireEnv('META_APP_ID', 'connecting Instagram/Facebook');
  const q = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri(), state: createState(userId), scope: META_SCOPES.join(','), response_type: 'code' });
  return `https://www.facebook.com/${env.META_GRAPH_VERSION}/dialog/oauth?${q.toString()}`;
}

export async function exchangeCodeForLongLivedToken(code: string): Promise<{ token: string; expiresIn?: number }> {
  const appId = requireEnv('META_APP_ID', 'connecting Instagram/Facebook');
  const secret = requireEnv('META_APP_SECRET', 'connecting Instagram/Facebook');
  const short = await graph<{ access_token: string }>('GET', '/oauth/access_token', { client_id: appId, client_secret: secret, redirect_uri: redirectUri(), code });
  const long = await graph<{ access_token: string; expires_in?: number }>('GET', '/oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: secret, fb_exchange_token: short.access_token,
  });
  return { token: long.access_token, expiresIn: long.expires_in };
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
}

export async function listPages(userToken: string): Promise<MetaPage[]> {
  const pages: MetaPage[] = [];
  let next: string | undefined;
  let first = true;
  do {
    const res: { data: MetaPage[]; paging?: { next?: string } } = first
      ? await graph('GET', '/me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: 100 }, userToken)
      : await graph('GET', next!, {});
    pages.push(...res.data);
    next = res.paging?.next;
    first = false;
  } while (next);
  return pages;
}

export async function granted(userToken: string): Promise<string[]> {
  const r = await graph<{ data: { permission: string; status: string }[] }>('GET', '/me/permissions', {}, userToken);
  return r.data.filter((p) => p.status === 'granted').map((p) => p.permission);
}
