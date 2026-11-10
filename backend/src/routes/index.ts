import { Router } from 'express';
import * as C from '../controllers';
import { aiLimiter, asyncHandler as h, requireAuth, requireInternal, requireWebhookSecret, validate } from '../middleware';
import * as S from '../schemas/api';

export const publicRouter = Router();
publicRouter.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
publicRouter.get('/accounts/callback/meta', h(C.accountsCtl.metaCallback));

export const webhookRouter = Router();
webhookRouter.post('/n8n', requireWebhookSecret, validate(S.webhookBody), h(C.webhooks.n8n));

export const internalRouter = Router();
internalRouter.use(requireInternal);
internalRouter.post('/stages/:stage/run', validate(S.internalRunBody), h(C.internal.runStage));
internalRouter.post('/scheduler/claim', h(C.internal.claimScheduled));
internalRouter.post('/analytics/sync-all', h(C.internal.syncAnalytics));
internalRouter.post('/n8n-error', h(C.internal.n8nError));

export const apiRouter = Router();
apiRouter.use(requireAuth);

// videos
apiRouter.post('/videos/upload-signature', h(C.videos.signature));
apiRouter.post('/videos/upload', validate(S.uploadRegisterBody), h(C.videos.register));
apiRouter.post('/videos/analyze', aiLimiter, validate(S.analyzeVideoBody), h(C.videos.analyze));
apiRouter.get('/videos', h(C.videos.list));
apiRouter.get('/videos/:id', h(C.videos.get));
apiRouter.get('/videos/:id/analysis', h(C.videos.analysis));
apiRouter.delete('/videos/:id', h(C.videos.remove));

// brands
apiRouter.get('/brands', h(C.brands.list));
apiRouter.post('/brands', validate(S.brandBody), h(C.brands.create));
apiRouter.put('/brands/:id', validate(S.brandBody), h(C.brands.update));
apiRouter.delete('/brands/:id', h(C.brands.remove));

// seo
apiRouter.post('/seo/analyze', aiLimiter, validate(S.seoAnalyzeBody), h(C.seo.analyze));
apiRouter.get('/seo/:id', h(C.seo.get));

// content
apiRouter.post('/content/generate', aiLimiter, validate(S.generateBody), h(C.contentCtl.generate));
apiRouter.post('/content/regenerate', aiLimiter, validate(S.regenerateBody), h(C.contentCtl.regenerate));
apiRouter.get('/content', validate(S.contentListQuery, 'query'), h(C.contentCtl.list));
apiRouter.get('/content/:id', h(C.contentCtl.get));
apiRouter.put('/content/:id', validate(S.updateContentBody), h(C.contentCtl.update));
apiRouter.delete('/content/:id', h(C.contentCtl.remove));
apiRouter.post('/content/:id/duplicate', h(C.contentCtl.duplicate));
apiRouter.get('/content/:id/versions', h(C.contentCtl.versions));
apiRouter.post('/content/:id/restore', validate(S.restoreBody), h(C.contentCtl.restore));

// publishing
apiRouter.post('/publish', validate(S.publishBody), h(C.publish.now));
apiRouter.post('/publish/schedule', validate(S.scheduleBody), h(C.publish.schedule));
apiRouter.post('/publish/retry', validate(S.retryBody), h(C.publish.retry));
apiRouter.get('/publish/scheduled', h(C.publish.scheduled));
apiRouter.delete('/publish/scheduled/:id', h(C.publish.cancelScheduled));
apiRouter.get('/publishing/jobs', validate(S.jobsQuery, 'query'), h(C.publish.jobs));

// accounts
apiRouter.get('/accounts', h(C.accountsCtl.list));
apiRouter.post('/accounts/connect', validate(S.connectBody), h(C.accountsCtl.connect));
apiRouter.post('/accounts/:id/test', h(C.accountsCtl.test));
apiRouter.delete('/accounts/:id', h(C.accountsCtl.remove));

// analytics, dashboard, settings, activity
apiRouter.get('/analytics', validate(S.analyticsQuery, 'query'), h(C.analyticsCtl.get));
apiRouter.post('/analytics/sync', h(C.analyticsCtl.sync));
apiRouter.post('/analytics/insights', aiLimiter, h(C.analyticsCtl.insights));
apiRouter.get('/dashboard', h(C.dashboard.get));
apiRouter.get('/activity', h(C.activity.list));
apiRouter.get('/settings', h(C.settingsCtl.get));
apiRouter.put('/settings', validate(S.settingsBody), h(C.settingsCtl.update));
apiRouter.get('/settings/system', h(C.settingsCtl.system));
