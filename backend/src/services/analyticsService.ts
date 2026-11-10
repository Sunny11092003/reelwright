import { COLLECTIONS } from '../shared/constants';
import type { AnalyticsSnapshot, AnalyticsSummary, GeneratedContent, Platform, PostMetrics, PublishedPost } from '../shared/types';
import { col, nowIso, newId } from '../firebase/repo';
import { getPublisher } from '../publishers';
import { loadAccount } from './accountService';
import { ga4Configured, pageViews } from '../integrations/analytics/ga4';
import { getTextProvider } from '../integrations/ai';
import { generateStructured } from '../integrations/ai/json';
import { insightsOutput } from '../schemas/ai';
import { INSIGHTS_SYSTEM, insightsPrompt } from '../prompts';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { getSettings } from './settingsService';
import { buildInstagramCaption } from '../publishers/instagram';
import { stripHtml } from '../utils/text';
import { wordCount } from './qualityRules';

const log = createLogger('analytics');
const WINDOW_DAYS = 60;

export async function syncUserAnalytics(userId: string, requestId: string): Promise<number> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const snap = await col(COLLECTIONS.publishedPosts).where('userId', '==', userId).where('publishedAt', '>=', cutoff).get();
  let written = 0;
  for (const d of snap.docs) {
    const post = { id: d.id, ...d.data() } as PublishedPost;
    try {
      let result: { metrics: PostMetrics; note?: string } | null = null;
      if (post.platform === 'website') {
        if (ga4Configured() && post.url) {
          const g = await pageViews(new URL(post.url).pathname, post.publishedAt.slice(0, 10));
          result = { metrics: { views: g.views } };
        }
      } else {
        const acc = await loadAccount(userId, post.accountId);
        const publisher = getPublisher(post.platform);
        if (publisher.fetchMetrics) result = await publisher.fetchMetrics(acc, post.externalId, post.url, post.publishedAt);
      }
      if (!result) continue;
      const date = nowIso().slice(0, 10);
      const snapDoc: Omit<AnalyticsSnapshot, 'id'> = { userId, publishedPostId: post.id, contentId: post.contentId, platform: post.platform, metrics: result.metrics, note: result.note, collectedAt: nowIso() };
      await col(COLLECTIONS.analytics).doc(`${post.id}_${date}`).set(snapDoc);
      await col(COLLECTIONS.publishedPosts).doc(post.id).set({ lastMetricsAt: nowIso() }, { merge: true });
      written++;
    } catch (e) {
      log.warn('Metrics fetch failed for post', { postId: post.id, platform: post.platform, message: (e as Error).message, requestId });
    }
  }
  return written;
}

export async function syncAllAnalytics(requestId: string): Promise<{ users: number; snapshots: number }> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const snap = await col(COLLECTIONS.publishedPosts).where('publishedAt', '>=', cutoff).select('userId').get();
  const users = [...new Set(snap.docs.map((d) => d.data().userId as string))];
  let snapshots = 0;
  for (const u of users) snapshots += await syncUserAnalytics(u, requestId);
  return { users: users.length, snapshots };
}

const emptyTotals = (): AnalyticsSummary['totals'][Platform] => ({ posts: 0 });
const METRIC_KEYS: (keyof PostMetrics)[] = ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'reactions'];

export async function getAnalytics(userId: string, days: number): Promise<AnalyticsSummary> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [postsSnap, snapsSnap, insightsSnap] = await Promise.all([
    col(COLLECTIONS.publishedPosts).where('userId', '==', userId).where('publishedAt', '>=', since).get(),
    col(COLLECTIONS.analytics).where('userId', '==', userId).where('collectedAt', '>=', since).get(),
    col(COLLECTIONS.analytics).doc(`insights_${userId}`).get(),
  ]);
  const posts = postsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as PublishedPost);
  const snaps = snapsSnap.docs.filter((d) => d.data().publishedPostId).map((d) => d.data() as AnalyticsSnapshot);
  const latest = new Map<string, AnalyticsSnapshot>();
  for (const s of snaps) {
    const p = latest.get(s.publishedPostId);
    if (!p || s.collectedAt > p.collectedAt) latest.set(s.publishedPostId, s);
  }
  const contentIds = [...new Set(posts.map((p) => p.contentId))];
  const titles = new Map<string, string>();
  if (contentIds.length) {
    const docs = await Promise.all(contentIds.map((id) => col(COLLECTIONS.content).doc(id).get()));
    docs.forEach((d) => d.exists && titles.set(d.id, (d.data() as GeneratedContent).title));
  }
  const totals: AnalyticsSummary['totals'] = { instagram: emptyTotals(), facebook: emptyTotals(), website: emptyTotals() };
  const rows: AnalyticsSummary['posts'] = [];
  for (const p of posts) {
    const s = latest.get(p.id);
    totals[p.platform].posts++;
    if (s) for (const k of METRIC_KEYS) if (typeof s.metrics[k] === 'number') totals[p.platform][k] = (totals[p.platform][k] ?? 0) + (s.metrics[k] as number);
    rows.push({ publishedPostId: p.id, contentId: p.contentId, title: titles.get(p.contentId) ?? 'Deleted content', platform: p.platform, url: p.url, publishedAt: p.publishedAt, metrics: s?.metrics ?? null, collectedAt: s?.collectedAt, note: s?.note });
  }
  const byDate = new Map<string, { date: string; instagram: number; facebook: number; website: number }>();
  for (const s of snaps) {
    const date = s.collectedAt.slice(0, 10);
    const row = byDate.get(date) ?? { date, instagram: 0, facebook: 0, website: 0 };
    row[s.platform] += s.metrics.views ?? 0;
    byDate.set(date, row);
  }
  const ins = insightsSnap.exists ? (insightsSnap.data() as { generatedAt: string; items: string[]; basedOnPosts: number }) : null;
  return {
    totals, posts: rows.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    series: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    insights: ins, websiteAnalyticsConfigured: ga4Configured(),
  };
}

export async function generateInsights(userId: string): Promise<NonNullable<AnalyticsSummary['insights']>> {
  const summary = await getAnalytics(userId, 90);
  const withMetrics = summary.posts.filter((p) => p.metrics && (p.metrics.views !== undefined || p.metrics.reach !== undefined));
  if (withMetrics.length < 3) throw new AppError('CONTENT_NOT_READY', 'Insights need at least 3 published posts with collected metrics. Publish more and sync analytics.', 409);
  const contentDocs = await Promise.all([...new Set(withMetrics.map((p) => p.contentId))].map((id) => col(COLLECTIONS.content).doc(id).get()));
  const content = new Map(contentDocs.filter((d) => d.exists).map((d) => [d.id, d.data() as GeneratedContent]));
  const rows = withMetrics.map((p) => {
    const c = content.get(p.contentId)?.content;
    let features: Record<string, unknown> = {};
    if (p.platform === 'instagram' && c?.instagram) features = { captionLength: buildInstagramCaption(c.instagram).length, hashtagCount: c.instagram.hashtags.length, hookLength: c.instagram.hook.length };
    if (p.platform === 'facebook' && c?.facebook) features = { captionLength: c.facebook.caption.length, hashtagCount: c.facebook.hashtags.length };
    if (p.platform === 'website' && c?.website) features = { articleWords: wordCount(stripHtml(c.website.articleHtml)), faqCount: c.website.faq.length };
    return { platform: p.platform, title: p.title, publishedAt: p.publishedAt.slice(0, 10), ...features, metrics: p.metrics };
  });
  const settings = await getSettings(userId);
  const out = await generateStructured(getTextProvider(settings), insightsOutput, { system: INSIGHTS_SYSTEM, prompt: insightsPrompt(rows), temperature: 0.2, maxOutputTokens: 2000 });
  const doc = { userId, kind: 'insights', generatedAt: nowIso(), items: out.insights.slice(0, 6), basedOnPosts: rows.length };
  await col(COLLECTIONS.analytics).doc(`insights_${userId}`).set(doc);
  return { generatedAt: doc.generatedAt, items: doc.items, basedOnPosts: doc.basedOnPosts };
}
void newId;
