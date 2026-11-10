import { COLLECTIONS } from '../shared/constants';
import { patchDoc, col } from '../firebase/repo';
import { triggerWorkflow, type Stage } from '../integrations/n8n';
import { AppError, toAppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { getSettings } from './settingsService';
import { runVideoAnalysis, errorInfo } from './videoService';
import { runSeoAnalysis } from './seoService';
import { runContentGeneration } from './contentService';
import { recomputeContentStatus, runPublishJob } from './publishingService';
import { syncUserAnalytics } from './analyticsService';
import type { PublishingJob } from '../shared/types';

const log = createLogger('orchestrator');

/** Runs one pipeline stage in-process. n8n calls this through /api/internal/stages/:stage/run. */
export async function runStage(stage: Stage, userId: string, resourceId: string, requestId: string): Promise<Record<string, unknown>> {
  try {
    switch (stage) {
      case 'video-analysis': {
        const a = await runVideoAnalysis(userId, resourceId, requestId);
        return { status: 'analyzed', analysisId: a.id };
      }
      case 'seo-analysis': {
        const s = await runSeoAnalysis(userId, resourceId, requestId);
        return { status: 'ready', seoId: s.id, primaryKeyword: s.primaryKeyword };
      }
      case 'content-generation': {
        const c = await runContentGeneration(userId, resourceId, requestId);
        return { status: c.status, contentId: c.id, needsReview: c.needsReview };
      }
      case 'publishing': {
        const j = await runPublishJob(userId, resourceId, requestId);
        return { status: j.status, jobId: j.id, url: j.publishedUrl ?? null, error: j.error ?? null };
      }
      case 'analytics-sync': {
        const n = await syncUserAnalytics(userId, requestId);
        return { status: 'synced', snapshots: n };
      }
    }
  } catch (e) {
    await failStage(stage, userId, resourceId, e, requestId);
    throw e;
  }
}

/** Records a stage failure on the owning resource. Idempotent so the n8n error callback can call it again. */
export async function failStage(stage: Stage, userId: string, resourceId: string, err: unknown, requestId: string): Promise<void> {
  const info = errorInfo(err, requestId);
  try {
    switch (stage) {
      case 'video-analysis':
        await patchDoc(COLLECTIONS.videos, resourceId, { status: 'failed', error: info });
        break;
      case 'seo-analysis':
        await patchDoc(COLLECTIONS.seoAnalyses, resourceId, { status: 'failed', error: info });
        break;
      case 'content-generation':
        await patchDoc(COLLECTIONS.content, resourceId, { status: 'failed', error: info });
        break;
      case 'publishing': {
        const snap = await col(COLLECTIONS.publishingJobs).doc(resourceId).get();
        if (!snap.exists) break;
        const job = { id: snap.id, ...snap.data() } as PublishingJob;
        if (job.status === 'queued' || job.status === 'publishing') {
          await patchDoc(COLLECTIONS.publishingJobs, resourceId, { status: 'failed', error: { ...info, platform: job.platform, retryCount: job.retryCount }, completedAt: new Date().toISOString(), progress: null });
          await recomputeContentStatus(userId, job.contentId);
        }
        break;
      }
      case 'analytics-sync':
        break;
    }
  } catch (e) {
    log.error('Failed to record stage failure', e);
  }
}

/** Starts a stage using the user's execution mode: n8n webhook, or in-process (direct) when n8n is not used. */
export async function dispatch(stage: Stage, userId: string, resourceId: string, requestId: string): Promise<void> {
  const settings = await getSettings(userId);
  if (settings.executionMode === 'n8n') {
    try {
      await triggerWorkflow({ stage, userId, resourceId, requestId });
    } catch (e) {
      await failStage(stage, userId, resourceId, e, requestId);
      throw e;
    }
    return;
  }
  setImmediate(() => {
    runStage(stage, userId, resourceId, requestId).catch((e) => log.error(`Stage ${stage} failed`, { error: toAppError(e).message, requestId, resourceId }));
  });
}

/** Used by the n8n failure callback. Does not overwrite a more specific error the backend already recorded. */
export async function failStageFromWebhook(stage: Stage, userId: string, resourceId: string, message: string, requestId: string): Promise<void> {
  const collectionByStage: Partial<Record<Stage, typeof COLLECTIONS[keyof typeof COLLECTIONS]>> = {
    'video-analysis': COLLECTIONS.videos, 'seo-analysis': COLLECTIONS.seoAnalyses, 'content-generation': COLLECTIONS.content,
  };
  const c = collectionByStage[stage];
  if (c) {
    const snap = await col(c).doc(resourceId).get();
    if (!snap.exists || snap.data()?.userId !== userId || snap.data()?.status === 'failed') return;
  }
  await failStage(stage, userId, resourceId, new AppError('N8N_REJECTED', message, 502), requestId);
}
