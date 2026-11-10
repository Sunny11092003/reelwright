import type { Request, Response } from 'express';
import type { z } from 'zod';
import { COLLECTIONS } from '../shared/constants';
import type { Brand, GeneratedContent, PublishingJob, ScheduledPost, SEOAnalysis, VideoAnalysis, VideoDoc } from '../shared/types';
import { env } from '../config/env';
import { col, deleteWhere, getOwned, listByUser, logActivity, newId, nowIso, patchDoc, setDoc } from '../firebase/repo';
import { signUpload } from '../integrations/cloudinary';
import { n8nConfigured, n8nHealth, type Stage } from '../integrations/n8n';
import { authUrl, verifyState } from '../integrations/meta/oauth';
import { ga4Configured } from '../integrations/analytics/ga4';
import { valid, uid } from '../middleware';
import * as S from '../schemas/api';
import { AppError, badRequest } from '../utils/errors';
import * as accounts from '../services/accountService';
import * as analytics from '../services/analyticsService';
import * as content from '../services/contentService';
import { getDashboard } from '../services/dashboardService';
import { dispatch, failStageFromWebhook, runStage } from '../services/orchestrator';
import * as publishing from '../services/publishingService';
import { createPendingSeo } from '../services/seoService';
import { getSettings, saveSettings } from '../services/settingsService';
import { deleteVideoCascade, registerVideo } from '../services/videoService';

type B<T extends z.ZodTypeAny> = z.infer<T>;

// ---------- videos ----------
export const videos = {
  signature: async (req: Request, res: Response) => { res.json(signUpload(uid(req))); },
  register: async (req: Request, res: Response) => {
    const b = valid<typeof S.uploadRegisterBody>(req) as B<typeof S.uploadRegisterBody>;
    res.status(201).json(await registerVideo(uid(req), b));
  },
  list: async (req: Request, res: Response) => res.json(await listByUser<VideoDoc>(COLLECTIONS.videos, uid(req), { orderBy: 'createdAt', limit: 200 })),
  get: async (req: Request, res: Response) => res.json(await getOwned<VideoDoc>(COLLECTIONS.videos, req.params.id, uid(req))),
  analysis: async (req: Request, res: Response) => {
    const v = await getOwned<VideoDoc>(COLLECTIONS.videos, req.params.id, uid(req));
    if (!v.analysisId) throw new AppError('NOT_FOUND', 'This video has not been analyzed yet', 404);
    res.json(await getOwned<VideoAnalysis>(COLLECTIONS.videoAnalysis, v.analysisId, uid(req)));
  },
  analyze: async (req: Request, res: Response) => {
    const { videoId } = valid<typeof S.analyzeVideoBody>(req) as B<typeof S.analyzeVideoBody>;
    const v = await getOwned<VideoDoc>(COLLECTIONS.videos, videoId, uid(req));
    if (v.status === 'analyzing') throw new AppError('CONFLICT', 'Analysis is already running', 409);
    await patchDoc(COLLECTIONS.videos, videoId, { status: 'analyzing', error: null });
    await dispatch('video-analysis', uid(req), videoId, req.requestId);
    res.status(202).json({ videoId, status: 'analyzing' });
  },
  remove: async (req: Request, res: Response) => {
    await deleteVideoCascade(uid(req), req.params.id);
    res.status(204).end();
  },
};

// ---------- brands ----------
export const brands = {
  list: async (req: Request, res: Response) => res.json(await listByUser<Brand>(COLLECTIONS.brands, uid(req), { orderBy: 'createdAt', direction: 'asc' })),
  create: async (req: Request, res: Response) => {
    const b = valid<typeof S.brandBody>(req) as B<typeof S.brandBody>;
    const id = newId(COLLECTIONS.brands);
    const now = nowIso();
    const doc = { ...b, userId: uid(req), createdAt: now, updatedAt: now };
    await setDoc(COLLECTIONS.brands, id, doc);
    await logActivity(uid(req), 'brand.saved', 'brand', id, `Created brand ${b.name}`);
    res.status(201).json({ id, ...doc });
  },
  update: async (req: Request, res: Response) => {
    const b = valid<typeof S.brandBody>(req) as B<typeof S.brandBody>;
    await getOwned<Brand>(COLLECTIONS.brands, req.params.id, uid(req));
    await patchDoc(COLLECTIONS.brands, req.params.id, { ...b });
    await logActivity(uid(req), 'brand.saved', 'brand', req.params.id, `Updated brand ${b.name}`);
    res.json(await getOwned<Brand>(COLLECTIONS.brands, req.params.id, uid(req)));
  },
  remove: async (req: Request, res: Response) => {
    await getOwned<Brand>(COLLECTIONS.brands, req.params.id, uid(req));
    const used = await col(COLLECTIONS.videos).where('userId', '==', uid(req)).where('brandId', '==', req.params.id).limit(1).get();
    if (!used.empty) throw new AppError('CONFLICT', 'This brand is used by uploaded videos and cannot be deleted', 409);
    await col(COLLECTIONS.brands).doc(req.params.id).delete();
    res.status(204).end();
  },
};

// ---------- seo ----------
export const seo = {
  analyze: async (req: Request, res: Response) => {
    const b = valid<typeof S.seoAnalyzeBody>(req) as B<typeof S.seoAnalyzeBody>;
    const doc = await createPendingSeo(uid(req), b.videoId, b.context);
    await dispatch('seo-analysis', uid(req), doc.id, req.requestId);
    res.status(202).json({ seoId: doc.id, status: 'pending' });
  },
  get: async (req: Request, res: Response) => res.json(await getOwned<SEOAnalysis>(COLLECTIONS.seoAnalyses, req.params.id, uid(req))),
};

// ---------- content ----------
export const contentCtl = {
  generate: async (req: Request, res: Response) => {
    const b = valid<typeof S.generateBody>(req) as B<typeof S.generateBody>;
    const doc = await content.createPendingContent(uid(req), b);
    await dispatch('content-generation', uid(req), doc.id, req.requestId);
    res.status(202).json({ contentId: doc.id, status: 'generating' });
  },
  regenerate: async (req: Request, res: Response) => {
    const b = valid<typeof S.regenerateBody>(req) as B<typeof S.regenerateBody>;
    res.json(await content.regenerate(uid(req), b, req.requestId));
  },
  list: async (req: Request, res: Response) => {
    const q = valid<typeof S.contentListQuery>(req, 'query') as B<typeof S.contentListQuery>;
    let items = await listByUser<GeneratedContent>(COLLECTIONS.content, uid(req), { orderBy: 'createdAt', limit: q.limit });
    if (q.status) items = items.filter((c) => c.status === q.status);
    if (q.platform) items = items.filter((c) => c.platforms.includes(q.platform!));
    if (q.brandId) items = items.filter((c) => c.brandId === q.brandId);
    if (q.from) items = items.filter((c) => c.createdAt >= q.from!);
    if (q.to) items = items.filter((c) => c.createdAt <= q.to!);
    if (q.q) {
      const needle = q.q.toLowerCase();
      items = items.filter((c) => JSON.stringify([c.title, c.content]).toLowerCase().includes(needle));
    }
    res.json(items);
  },
  get: async (req: Request, res: Response) => res.json(await getOwned<GeneratedContent>(COLLECTIONS.content, req.params.id, uid(req))),
  update: async (req: Request, res: Response) => {
    const b = valid<typeof S.updateContentBody>(req) as B<typeof S.updateContentBody>;
    res.json(await content.updateContent(uid(req), req.params.id, b as Parameters<typeof content.updateContent>[2]));
  },
  remove: async (req: Request, res: Response) => {
    await content.deleteContent(uid(req), req.params.id);
    res.status(204).end();
  },
  duplicate: async (req: Request, res: Response) => res.status(201).json(await content.duplicateContent(uid(req), req.params.id)),
  versions: async (req: Request, res: Response) => res.json(await content.listVersions(uid(req), req.params.id)),
  restore: async (req: Request, res: Response) => {
    const b = valid<typeof S.restoreBody>(req) as B<typeof S.restoreBody>;
    res.json(await content.restoreVersion(uid(req), req.params.id, b.versionId));
  },
};

// ---------- publishing ----------
export const publish = {
  now: async (req: Request, res: Response) => {
    const b = valid<typeof S.publishBody>(req) as B<typeof S.publishBody>;
    const jobs = await publishing.createPublishJobs(uid(req), b.contentId, b.targets, b.options, req.requestId);
    const failures: { jobId: string; error: string }[] = [];
    for (const j of jobs) {
      try { await dispatch('publishing', uid(req), j.id, req.requestId); } catch (e) { failures.push({ jobId: j.id, error: (e as Error).message }); }
    }
    if (failures.length === jobs.length) throw new AppError('N8N_UNAVAILABLE', failures[0].error, 503, { jobs: jobs.map((j) => j.id) }, true);
    res.status(202).json({ jobs: jobs.map((j) => ({ id: j.id, platform: j.platform, status: 'queued' })), failures });
  },
  schedule: async (req: Request, res: Response) => {
    const b = valid<typeof S.scheduleBody>(req) as B<typeof S.scheduleBody>;
    res.status(201).json(await publishing.schedulePosts(uid(req), b));
  },
  retry: async (req: Request, res: Response) => {
    const b = valid<typeof S.retryBody>(req) as B<typeof S.retryBody>;
    const job = await publishing.retryJob(uid(req), b.jobId, req.requestId);
    await dispatch('publishing', uid(req), job.id, req.requestId);
    res.status(202).json({ jobId: job.id, status: 'queued', retryCount: job.retryCount });
  },
  jobs: async (req: Request, res: Response) => {
    const q = valid<typeof S.jobsQuery>(req, 'query') as B<typeof S.jobsQuery>;
    let jobs = await listByUser<PublishingJob>(COLLECTIONS.publishingJobs, uid(req), { orderBy: 'createdAt', limit: q.limit });
    if (q.contentId) jobs = jobs.filter((j) => j.contentId === q.contentId);
    if (q.status) jobs = jobs.filter((j) => j.status === q.status);
    res.json(jobs);
  },
  scheduled: async (req: Request, res: Response) => res.json(await listByUser<ScheduledPost>(COLLECTIONS.scheduledPosts, uid(req), { orderBy: 'scheduledAt', direction: 'asc', limit: 300 })),
  cancelScheduled: async (req: Request, res: Response) => {
    await publishing.cancelScheduled(uid(req), req.params.id);
    res.status(204).end();
  },
};

// ---------- accounts ----------
export const accountsCtl = {
  list: async (req: Request, res: Response) => res.json(await accounts.listAccounts(uid(req))),
  connect: async (req: Request, res: Response) => {
    const b = valid<typeof S.connectBody>(req) as B<typeof S.connectBody>;
    if (b.provider === 'meta') {
      res.json({ authUrl: authUrl(uid(req)) });
      return;
    }
    res.status(201).json(await accounts.connectWordPress(uid(req), b));
  },
  metaCallback: async (req: Request, res: Response) => {
    const front = env.FRONTEND_URL.replace(/\/$/, '');
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;
    try {
      if (error) throw new AppError('META_API_ERROR', error_description ?? 'Meta connection was cancelled', 400);
      if (!code || !state) throw new AppError('VALIDATION_ERROR', 'Missing code or state', 400);
      const userId = verifyState(state);
      const connected = await accounts.connectMetaFromCode(userId, code);
      res.redirect(`${front}/accounts?connected=meta&count=${connected.length}`);
    } catch (e) {
      req.log.warn('Meta callback failed', { message: (e as Error).message });
      res.redirect(`${front}/accounts?error=${encodeURIComponent((e as Error).message)}`);
    }
  },
  test: async (req: Request, res: Response) => res.json(await accounts.testAccount(uid(req), req.params.id)),
  remove: async (req: Request, res: Response) => {
    await accounts.disconnectAccount(uid(req), req.params.id);
    res.status(204).end();
  },
};

// ---------- analytics / dashboard / settings / activity ----------
export const analyticsCtl = {
  get: async (req: Request, res: Response) => {
    const q = valid<typeof S.analyticsQuery>(req, 'query') as B<typeof S.analyticsQuery>;
    res.json(await analytics.getAnalytics(uid(req), q.days));
  },
  sync: async (req: Request, res: Response) => {
    await dispatch('analytics-sync', uid(req), uid(req), req.requestId);
    res.status(202).json({ status: 'started' });
  },
  insights: async (req: Request, res: Response) => res.json(await analytics.generateInsights(uid(req))),
};

export const dashboard = { get: async (req: Request, res: Response) => res.json(await getDashboard(uid(req))) };
export const activity = { list: async (req: Request, res: Response) => res.json(await listByUser(COLLECTIONS.activityLogs, uid(req), { orderBy: 'createdAt', limit: 100 })) };

export const settingsCtl = {
  get: async (req: Request, res: Response) => res.json(await getSettings(uid(req))),
  update: async (req: Request, res: Response) => {
    const b = valid<typeof S.settingsBody>(req) as B<typeof S.settingsBody>;
    if (b.defaultTimezone) {
      try { new Intl.DateTimeFormat('en', { timeZone: b.defaultTimezone }); } catch { throw badRequest('Invalid timezone'); }
    }
    if (b.executionMode === 'n8n' && !n8nConfigured()) throw new AppError('CONFIG_MISSING', 'Set N8N_BASE_URL and N8N_WEBHOOK_SECRET on the backend before enabling n8n.', 400);
    const s = await saveSettings(uid(req), b as never);
    await logActivity(uid(req), 'settings.saved', 'settings', uid(req), 'Updated settings');
    res.json(s);
  },
  system: async (_req: Request, res: Response) => {
    const n8n = await n8nHealth();
    res.json({
      n8n: { configured: n8nConfigured(), ...n8n, baseUrl: env.N8N_BASE_URL ?? null, webhookPrefix: env.N8N_WEBHOOK_PATH_PREFIX },
      providers: { gemini: Boolean(env.GEMINI_API_KEY), anthropic: Boolean(env.ANTHROPIC_API_KEY) },
      meta: { configured: Boolean(env.META_APP_ID && env.META_APP_SECRET), graphVersion: env.META_GRAPH_VERSION },
      ga4: { configured: ga4Configured() },
      limits: { maxUploadMb: env.MAX_UPLOAD_MB },
      internalScheduler: env.RUN_INTERNAL_SCHEDULER,
    });
  },
};

// ---------- n8n inbound ----------
export const webhooks = {
  n8n: async (req: Request, res: Response) => {
    const b = valid<typeof S.webhookBody>(req) as B<typeof S.webhookBody>;
    if (b.event === 'stage.failed') {
      await failStageFromWebhook(b.stage as Stage, b.userId, b.resourceId, b.error?.message ?? 'Workflow reported a failure', b.requestId ?? 'n8n');
    }
    req.log.info('n8n callback', { event: b.event, stage: b.stage, resourceId: b.resourceId });
    res.json({ received: true });
  },
};

export const internal = {
  runStage: async (req: Request, res: Response) => {
    const stage = req.params.stage as Stage;
    if (!['video-analysis', 'seo-analysis', 'content-generation', 'publishing', 'analytics-sync'].includes(stage)) throw badRequest('Unknown stage');
    const b = valid<typeof S.internalRunBody>(req) as B<typeof S.internalRunBody>;
    res.json(await runStage(stage, b.userId, b.resourceId, b.requestId));
  },
  claimScheduled: async (_req: Request, res: Response) => {
    await publishing.recoverStaleJobs();
    res.json({ jobs: await publishing.claimDueScheduledPosts() });
  },
  syncAnalytics: async (req: Request, res: Response) => res.json(await analytics.syncAllAnalytics(req.requestId)),
  n8nError: async (req: Request, res: Response) => {
    const b = (req.body ?? {}) as { workflow?: string; executionId?: string; message?: string; node?: string };
    req.log.error('n8n workflow error', { workflow: String(b.workflow ?? '').slice(0, 120), executionId: String(b.executionId ?? '').slice(0, 60), node: String(b.node ?? '').slice(0, 120), message: String(b.message ?? '').slice(0, 500) });
    res.json({ logged: true });
  },
};
void deleteWhere;
