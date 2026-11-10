import { env } from '../config/env';
import { COLLECTIONS } from '../shared/constants';
import type { UserSettings } from '../shared/types';
import { col, nowIso } from '../firebase/repo';

export function defaultSettings(userId: string): UserSettings {
  return {
    userId,
    aiProvider: env.AI_DEFAULT_PROVIDER,
    aiModel: env.AI_DEFAULT_PROVIDER === 'gemini' ? env.GEMINI_MODEL : env.ANTHROPIC_MODEL,
    videoProvider: 'gemini',
    defaultLanguage: 'en',
    defaultCountry: '',
    defaultTimezone: 'UTC',
    defaultBrandId: null,
    executionMode: env.DEFAULT_EXECUTION_MODE,
    seo: { titleMaxLength: 60, metaMaxLength: 155, maxInstagramHashtags: 12, goal: 'Increase organic discovery and local reach' },
    publishing: { defaultPlatforms: ['instagram', 'facebook', 'website'], wordpressStatus: 'publish' },
    wordpress: { seoPlugin: 'none', includeSchema: false, embedVideo: true },
    updatedAt: nowIso(),
  };
}

export async function getSettings(userId: string): Promise<UserSettings> {
  const snap = await col(COLLECTIONS.settings).doc(userId).get();
  const d = defaultSettings(userId);
  if (!snap.exists) return d;
  const s = snap.data() as Partial<UserSettings>;
  return {
    ...d,
    ...s,
    userId,
    seo: { ...d.seo, ...(s.seo ?? {}) },
    publishing: { ...d.publishing, ...(s.publishing ?? {}) },
    wordpress: { ...d.wordpress, ...(s.wordpress ?? {}) },
  };
}

export async function saveSettings(userId: string, patch: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings(userId);
  const next: UserSettings = {
    ...current,
    ...patch,
    userId,
    seo: { ...current.seo, ...(patch.seo ?? {}) },
    publishing: { ...current.publishing, ...(patch.publishing ?? {}) },
    wordpress: { ...current.wordpress, ...(patch.wordpress ?? {}) },
    updatedAt: nowIso(),
  };
  await col(COLLECTIONS.settings).doc(userId).set(next);
  return next;
}
