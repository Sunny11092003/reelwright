import { COLLECTIONS } from '../shared/constants';
import type { ConnectedAccount } from '../shared/types';
import { col, getOwned, listByUser, logActivity, nowIso } from '../firebase/repo';
import { decryptJson, encryptJson } from '../utils/crypto';
import { AppError } from '../utils/errors';
import { exchangeCodeForLongLivedToken, granted, listPages } from '../integrations/meta/oauth';
import { normalizeSiteUrl, testConnection as wpTest, type WpCredentials } from '../integrations/wordpress';
import { getPublisher } from '../publishers';
import type { AccountWithSecret } from '../publishers/types';

const accountId = (userId: string, provider: string, externalId: string) => `${userId}_${provider}_${externalId}`.replace(/[^\w-]/g, '_');

async function upsert(account: ConnectedAccount, secret: Record<string, string>): Promise<void> {
  await col(COLLECTIONS.connectedAccounts).doc(account.id).set(account);
  await col(COLLECTIONS.accountSecrets).doc(account.id).set({ userId: account.userId, encrypted: encryptJson(secret), updatedAt: nowIso() });
}

export async function connectMetaFromCode(userId: string, code: string): Promise<ConnectedAccount[]> {
  const { token } = await exchangeCodeForLongLivedToken(code);
  const [pages, scopes] = await Promise.all([listPages(token), granted(token)]);
  if (pages.length === 0) {
    throw new AppError('META_API_ERROR', 'No Facebook Pages were granted. During connection choose the Pages you want to manage.', 400);
  }
  const now = nowIso();
  const out: ConnectedAccount[] = [];
  for (const p of pages) {
    const fb: ConnectedAccount = {
      id: accountId(userId, 'meta', p.id), userId, provider: 'meta', platform: 'facebook', externalId: p.id, name: p.name,
      status: 'connected', scopes, lastCheckedAt: now, connectedAt: now, updatedAt: now,
    };
    await upsert(fb, { accessToken: p.access_token });
    out.push(fb);
    if (p.instagram_business_account) {
      const ig: ConnectedAccount = {
        id: accountId(userId, 'meta', p.instagram_business_account.id), userId, provider: 'meta', platform: 'instagram',
        externalId: p.instagram_business_account.id, name: p.instagram_business_account.username ? `@${p.instagram_business_account.username}` : p.name,
        username: p.instagram_business_account.username, linkedPageId: p.id, status: 'connected', scopes, lastCheckedAt: now, connectedAt: now, updatedAt: now,
      };
      await upsert(ig, { accessToken: p.access_token });
      out.push(ig);
    }
  }
  await logActivity(userId, 'account.connected', 'account', out[0].id, `Connected ${out.length} Meta account(s)`, { count: out.length });
  return out;
}

export async function connectWordPress(userId: string, input: { siteUrl: string; username: string; applicationPassword: string }): Promise<ConnectedAccount> {
  const siteUrl = await normalizeSiteUrl(input.siteUrl);
  const creds: WpCredentials = { siteUrl, username: input.username, applicationPassword: input.applicationPassword };
  const r = await wpTest(creds);
  if (!r.canPublish) throw new AppError('WORDPRESS_AUTH', `${r.name} cannot publish posts. Use an Editor or Administrator account.`, 403);
  const now = nowIso();
  const acc: ConnectedAccount = {
    id: accountId(userId, 'wordpress', new URL(siteUrl).host + new URL(siteUrl).pathname), userId, provider: 'wordpress', platform: 'website',
    externalId: String(r.id), name: r.siteName, username: input.username, siteUrl, status: 'connected', lastCheckedAt: now, connectedAt: now, updatedAt: now,
  };
  await upsert(acc, { username: input.username, applicationPassword: input.applicationPassword });
  await logActivity(userId, 'account.connected', 'account', acc.id, `Connected WordPress site ${r.siteName}`);
  return acc;
}

export const listAccounts = (userId: string) => listByUser<ConnectedAccount>(COLLECTIONS.connectedAccounts, userId, { orderBy: 'connectedAt', direction: 'desc' });

export async function loadAccount(userId: string, id: string): Promise<AccountWithSecret> {
  const account = await getOwned<ConnectedAccount>(COLLECTIONS.connectedAccounts, id, userId);
  const snap = await col(COLLECTIONS.accountSecrets).doc(id).get();
  if (!snap.exists || snap.data()?.userId !== userId) throw new AppError('ACCOUNT_NOT_CONNECTED', 'Account credentials are missing. Reconnect the account.', 409);
  return { account, secret: decryptJson<Record<string, string>>(snap.data()!.encrypted as string) };
}

export async function markAccount(id: string, status: ConnectedAccount['status'], lastError?: string): Promise<void> {
  await col(COLLECTIONS.connectedAccounts).doc(id).set({ status, lastError: lastError ?? null, lastCheckedAt: nowIso(), updatedAt: nowIso() }, { merge: true });
}

export async function testAccount(userId: string, id: string): Promise<{ ok: boolean; detail: string }> {
  const acc = await loadAccount(userId, id);
  try {
    const r = await getPublisher(acc.account.platform).testConnection(acc);
    await markAccount(id, r.ok ? 'connected' : 'error', r.ok ? undefined : r.detail);
    return r;
  } catch (e) {
    const err = e as AppError;
    await markAccount(id, err.code === 'META_TOKEN_EXPIRED' || err.code === 'WORDPRESS_AUTH' ? 'expired' : 'error', err.message);
    throw e;
  }
}

export async function disconnectAccount(userId: string, id: string): Promise<void> {
  const acc = await getOwned<ConnectedAccount>(COLLECTIONS.connectedAccounts, id, userId);
  const pending = await col(COLLECTIONS.scheduledPosts).where('userId', '==', userId).where('accountId', '==', id).where('status', '==', 'scheduled').limit(1).get();
  if (!pending.empty) throw new AppError('CONFLICT', 'This account has scheduled posts. Cancel them before disconnecting.', 409);
  await Promise.all([col(COLLECTIONS.connectedAccounts).doc(id).delete(), col(COLLECTIONS.accountSecrets).doc(id).delete()]);
  await logActivity(userId, 'account.disconnected', 'account', id, `Disconnected ${acc.name}`);
}
