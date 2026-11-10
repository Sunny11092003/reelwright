import { COLLECTIONS, MAX_RETRY_COUNT } from '../shared/constants';
import type {
  ConnectedAccount, GeneratedContent, Platform, PublishOptions, PublishedPost, PublishingJob, ScheduledPost, VideoDoc,
} from '../shared/types';
import { col, getOwned, logActivity, newId, nowIso, patchDoc, setDoc } from '../firebase/repo';
import { db } from '../firebase/admin';
import { AppError, badRequest, toAppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { getPublisher } from '../publishers';
import { loadAccount, markAccount } from './accountService';
import { getSettings } from './settingsService';
import { errorInfo } from './videoService';

const log = createLogger('publishing');

export interface Target { platform: Platform; accountId: string }

async function validateTargets(userId: string, content: GeneratedContent, targets: Target[]): Promise<void> {
  if (targets.length === 0) throw badRequest('Select at least one platform');
  const seen = new Set<string>();
  const video = await getOwned<VideoDoc>(COLLECTIONS.videos, content.videoId, userId);
  for (const t of targets) {
    if (seen.has(t.platform)) throw badRequest(`Only one account per platform can be selected (${t.platform})`);
    seen.add(t.platform);
    if (!content.platforms.includes(t.platform) || !content.content[t.platform]) throw new AppError('CONTENT_NOT_READY', `No ${t.platform} content exists for this item`, 409);
    const acc = await getOwned<ConnectedAccount>(COLLECTIONS.connectedAccounts, t.accountId, userId);
    if (acc.platform !== t.platform) throw badRequest(`Account ${acc.name} cannot publish to ${t.platform}`);
    if (acc.status !== 'connected') throw new AppError('ACCOUNT_NOT_CONNECTED', `${acc.name} needs to be reconnected`, 409);
    getPublisher(t.platform).validate(content.content, video);
  }
}

function newJob(userId: string, content: GeneratedContent, t: Target, options: PublishOptions, requestId: string, scheduledPostId?: string): [string, Omit<PublishingJob, 'id'>] {
  const id = newId(COLLECTIONS.publishingJobs);
  const now = nowIso();
  return [id, {
    userId, contentId: content.id, videoId: content.videoId, platform: t.platform, accountId: t.accountId, status: 'queued', options,
    retryCount: 0, requestId, scheduledPostId, createdAt: now, updatedAt: now,
  }];
}

export async function createPublishJobs(userId: string, contentId: string, targets: Target[], options: PublishOptions, requestId: string): Promise<PublishingJob[]> {
  const content = await getOwned<GeneratedContent>(COLLECTIONS.content, contentId, userId);
  if (content.status === 'publishing') throw new AppError('CONFLICT', 'This content is already being published', 409);
  await validateTargets(userId, content, targets);
  const jobs: PublishingJob[] = [];
  for (const t of targets) {
    const [id, doc] = newJob(userId, content, t, options, requestId);
    await setDoc(COLLECTIONS.publishingJobs, id, doc);
    jobs.push({ id, ...doc });
  }
  await patchDoc(COLLECTIONS.content, contentId, { status: 'publishing', error: null });
  return jobs;
}

export async function schedulePosts(userId: string, input: { contentId: string; targets: Target[]; scheduledAt: string; timezone: string; options: PublishOptions }): Promise<ScheduledPost[]> {
  const when = new Date(input.scheduledAt);
  if (Number.isNaN(when.getTime())) throw badRequest('Invalid schedule time');
  if (when.getTime() < Date.now() + 60_000) throw badRequest('Schedule time must be at least one minute in the future');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { throw badRequest('Invalid timezone'); }
  const content = await getOwned<GeneratedContent>(COLLECTIONS.content, input.contentId, userId);
  await validateTargets(userId, content, input.targets);
  const out: ScheduledPost[] = [];
  const now = nowIso();
  for (const t of input.targets) {
    const id = newId(COLLECTIONS.scheduledPosts);
    const doc: Omit<ScheduledPost, 'id'> = {
      userId, contentId: input.contentId, platform: t.platform, accountId: t.accountId, scheduledAt: when.toISOString(),
      timezone: input.timezone, status: 'scheduled', options: input.options, createdAt: now, updatedAt: now,
    };
    await setDoc(COLLECTIONS.scheduledPosts, id, doc);
    out.push({ id, ...doc });
  }
  await patchDoc(COLLECTIONS.content, input.contentId, { status: 'scheduled' });
  await logActivity(userId, 'post.scheduled', 'content', input.contentId, `Scheduled ${content.title} for ${when.toISOString()}`, { platforms: input.targets.map((t) => t.platform) });
  return out;
}

export async function cancelScheduled(userId: string, id: string): Promise<void> {
  const sp = await getOwned<ScheduledPost>(COLLECTIONS.scheduledPosts, id, userId);
  if (sp.status !== 'scheduled') throw new AppError('CONFLICT', `This post is already ${sp.status}`, 409);
  await patchDoc(COLLECTIONS.scheduledPosts, id, { status: 'cancelled' });
  await logActivity(userId, 'post.cancelled', 'content', sp.contentId, `Cancelled scheduled ${sp.platform} post`);
  await recomputeContentStatus(userId, sp.contentId);
}

export async function retryJob(userId: string, jobId: string, requestId: string): Promise<PublishingJob> {
  const job = await getOwned<PublishingJob>(COLLECTIONS.publishingJobs, jobId, userId);
  if (job.status !== 'failed') throw new AppError('CONFLICT', 'Only failed jobs can be retried', 409);
  if (job.retryCount >= MAX_RETRY_COUNT) throw new AppError('CONFLICT', `This job reached the retry limit (${MAX_RETRY_COUNT}). Create a new publish request.`, 409);
  const content = await getOwned<GeneratedContent>(COLLECTIONS.content, job.contentId, userId);
  await patchDoc(COLLECTIONS.publishingJobs, jobId, { status: 'queued', retryCount: job.retryCount + 1, requestId, progress: null });
  await patchDoc(COLLECTIONS.content, content.id, { status: 'publishing' });
  await logActivity(userId, 'post.retried', 'job', jobId, `Retrying ${job.platform} publish`, { retryCount: job.retryCount + 1 });
  return { ...job, status: 'queued', retryCount: job.retryCount + 1, requestId };
}

/** Executes a single publishing job. Used by n8n (via /internal) and by direct mode. */
export async function runPublishJob(userId: string, jobId: string, requestId: string): Promise<PublishingJob> {
  const jobRef = col(COLLECTIONS.publishingJobs).doc(jobId);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists || snap.data()?.userId !== userId) throw new AppError('NOT_FOUND', 'Publishing job not found', 404);
    if (snap.data()?.status !== 'queued') return false;
    tx.update(jobRef, { status: 'publishing', startedAt: nowIso(), updatedAt: nowIso(), progress: 'Starting' });
    return true;
  });
  const job = await getOwned<PublishingJob>(COLLECTIONS.publishingJobs, jobId, userId);
  if (!claimed) return job; // already running or finished: idempotent
  const jlog = log.child({ requestId, userId });
  try {
    const [content, video, account, settings] = await Promise.all([
      getOwned<GeneratedContent>(COLLECTIONS.content, job.contentId, userId),
      getOwned<VideoDoc>(COLLECTIONS.videos, job.videoId, userId),
      loadAccount(userId, job.accountId),
      getSettings(userId),
    ]);
    const publisher = getPublisher(job.platform);
    publisher.validate(content.content, video);
    const result = await publisher.publish({
      account, video, content: content.content, title: content.title, options: job.options, settings, log: jlog,
      progress: (m) => patchDoc(COLLECTIONS.publishingJobs, jobId, { progress: m }),
    });
    const publishedAt = nowIso();
    const ppId = newId(COLLECTIONS.publishedPosts);
    const pp: Omit<PublishedPost, 'id'> = {
      userId, contentId: job.contentId, videoId: job.videoId, platform: job.platform, accountId: job.accountId, jobId,
      externalId: result.externalId, url: result.url, publishedAt,
    };
    await setDoc(COLLECTIONS.publishedPosts, ppId, pp);
    await patchDoc(COLLECTIONS.publishingJobs, jobId, { status: 'published', externalId: result.externalId, publishedUrl: result.url ?? null, completedAt: publishedAt, progress: 'Done', error: null });
    if (job.scheduledPostId) await patchDoc(COLLECTIONS.scheduledPosts, job.scheduledPostId, { status: 'published', jobId });
    await logActivity(userId, 'post.published', 'job', jobId, `Published to ${job.platform}`, { url: result.url, requestId });
    await recomputeContentStatus(userId, job.contentId);
    return { ...job, status: 'published', externalId: result.externalId, publishedUrl: result.url };
  } catch (e) {
    const err = toAppError(e);
    jlog.error('publish failed', e);
    const info = errorInfo(err, requestId, job.platform, job.retryCount);
    await patchDoc(COLLECTIONS.publishingJobs, jobId, { status: 'failed', error: info, completedAt: nowIso(), progress: null });
    if (job.scheduledPostId) await patchDoc(COLLECTIONS.scheduledPosts, job.scheduledPostId, { status: 'failed', jobId });
    if (err.code === 'META_TOKEN_EXPIRED' || err.code === 'WORDPRESS_AUTH') await markAccount(job.accountId, 'expired', err.message).catch(() => undefined);
    await logActivity(userId, 'post.failed', 'job', jobId, `Publishing to ${job.platform} failed: ${err.message}`, { code: err.code, requestId });
    await recomputeContentStatus(userId, job.contentId);
    return { ...job, status: 'failed', error: info };
  }
}

export async function recomputeContentStatus(userId: string, contentId: string): Promise<void> {
  const contentSnap = await col(COLLECTIONS.content).doc(contentId).get();
  if (!contentSnap.exists) return;
  const [jobsSnap, schedSnap] = await Promise.all([
    col(COLLECTIONS.publishingJobs).where('userId', '==', userId).where('contentId', '==', contentId).get(),
    col(COLLECTIONS.scheduledPosts).where('userId', '==', userId).where('contentId', '==', contentId).where('status', '==', 'scheduled').get(),
  ]);
  const latest = new Map<Platform, PublishingJob>();
  for (const d of jobsSnap.docs) {
    const j = { id: d.id, ...d.data() } as PublishingJob;
    const prev = latest.get(j.platform);
    if (!prev || j.createdAt > prev.createdAt) latest.set(j.platform, j);
  }
  const jobs = [...latest.values()];
  let status: GeneratedContent['status'];
  const patch: Record<string, unknown> = {};
  if (jobs.some((j) => j.status === 'queued' || j.status === 'publishing')) status = 'publishing';
  else if (!schedSnap.empty) status = 'scheduled';
  else if (jobs.some((j) => j.status === 'failed')) {
    status = 'failed';
    patch.error = jobs.find((j) => j.status === 'failed')?.error ?? null;
  } else if (jobs.some((j) => j.status === 'published')) {
    status = 'published';
    patch.publishedAt = jobs.map((j) => j.completedAt ?? '').sort().pop();
  } else status = 'ready';
  await patchDoc(COLLECTIONS.content, contentId, { status, ...patch });
}

/** Atomically moves due scheduled posts to publishing jobs. Safe for concurrent callers (n8n + direct scheduler). */
export async function claimDueScheduledPosts(limit = 20): Promise<{ jobId: string; userId: string }[]> {
  const due = await col(COLLECTIONS.scheduledPosts).where('status', '==', 'scheduled').where('scheduledAt', '<=', nowIso()).orderBy('scheduledAt', 'asc').limit(limit).get();
  const claimed: { jobId: string; userId: string }[] = [];
  for (const d of due.docs) {
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(d.ref);
      const sp = { id: snap.id, ...snap.data() } as ScheduledPost;
      if (!snap.exists || sp.status !== 'scheduled') return null;
      const contentSnap = await tx.get(col(COLLECTIONS.content).doc(sp.contentId));
      const jobId = newId(COLLECTIONS.publishingJobs);
      const now = nowIso();
      if (!contentSnap.exists) {
        tx.update(d.ref, { status: 'cancelled', updatedAt: now });
        return null;
      }
      const job: Omit<PublishingJob, 'id'> = {
        userId: sp.userId, contentId: sp.contentId, videoId: contentSnap.data()!.videoId, platform: sp.platform, accountId: sp.accountId,
        status: 'queued', options: sp.options ?? {}, retryCount: 0, requestId: `sched-${sp.id}`, scheduledPostId: sp.id, createdAt: now, updatedAt: now,
      };
      tx.set(col(COLLECTIONS.publishingJobs).doc(jobId), job);
      tx.update(d.ref, { status: 'processing', jobId, updatedAt: now });
      tx.update(col(COLLECTIONS.content).doc(sp.contentId), { status: 'publishing', updatedAt: now });
      return { jobId, userId: sp.userId };
    });
    if (out) claimed.push(out);
  }
  return claimed;
}

/** Marks jobs stuck in "publishing" (e.g. server crash) as failed so users can retry. */
export async function recoverStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 45 * 60_000).toISOString();
  const snap = await col(COLLECTIONS.publishingJobs).where('status', '==', 'publishing').where('startedAt', '<', cutoff).limit(50).get();
  for (const d of snap.docs) {
    const j = { id: d.id, ...d.data() } as PublishingJob;
    await patchDoc(COLLECTIONS.publishingJobs, j.id, {
      status: 'failed', progress: null, completedAt: nowIso(),
      error: { errorCode: 'JOB_TIMEOUT', errorMessage: 'The publishing job did not finish in time. Retry to publish again.', platform: j.platform, timestamp: nowIso(), requestId: j.requestId, retryCount: j.retryCount },
    });
    await recomputeContentStatus(j.userId, j.contentId);
  }
  return snap.size;
}
