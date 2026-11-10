import type { z } from 'zod';
import { COLLECTIONS } from '../shared/constants';
import type {
  Brand, ContentVersion, GeneratedContent, Platform, PlatformContent, QualityIssue, QualityReport,
  SEOAnalysis, UserSettings, VideoAnalysis, VideoDoc,
} from '../shared/types';
import { col, getById, getOwned, logActivity, newId, nowIso, patchDoc, setDoc } from '../firebase/repo';
import { getTextProvider } from '../integrations/ai';
import type { AIProvider } from '../integrations/ai';
import { generateStructured } from '../integrations/ai/json';
import { fieldRegenOutput, platformSchemas, qualityOutput } from '../schemas/ai';
import {
  PLATFORM_SYSTEM, QUALITY_SYSTEM, facebookPrompt, instagramPrompt, qualityPrompt, regenerateFieldPrompt,
  regeneratePlatformPrompt, websitePrompt, type PlatformPromptInput,
} from '../prompts';
import { AppError, badRequest } from '../utils/errors';
import { normalizeHashtags, sanitizeHtml, slugify } from '../utils/text';
import { ruleBasedChecks } from './qualityRules';
import { getSettings } from './settingsService';

const MAX_ATTEMPTS = 2;

interface Ctx {
  analysis: VideoAnalysis;
  seo: SEOAnalysis;
  brand: Brand | null;
  settings: UserSettings;
  provider: AIProvider;
}

async function loadCtx(userId: string, analysisId: string, seoId: string, brandId: string | null): Promise<Ctx> {
  const [analysis, seo, brand, settings] = await Promise.all([
    getOwned<VideoAnalysis>(COLLECTIONS.videoAnalysis, analysisId, userId),
    getOwned<SEOAnalysis>(COLLECTIONS.seoAnalyses, seoId, userId),
    brandId ? getById<Brand>(COLLECTIONS.brands, brandId) : Promise.resolve(null),
    getSettings(userId),
  ]);
  if (seo.status !== 'ready') throw new AppError('CONTENT_NOT_READY', 'SEO analysis is not complete', 409);
  return { analysis, seo, brand: brand && brand.userId === userId ? brand : null, settings, provider: getTextProvider(settings) };
}

function promptInput(c: Ctx, feedback?: string[]): PlatformPromptInput {
  return { analysis: c.analysis, seo: c.seo, brand: c.brand, settings: c.settings, feedback };
}

function basePrompt(platform: Platform, c: Ctx, feedback?: string[]): string {
  const i = promptInput(c, feedback);
  return platform === 'instagram' ? instagramPrompt(i) : platform === 'facebook' ? facebookPrompt(i) : websitePrompt(i);
}

function postProcess(platform: Platform, data: Record<string, unknown>, c: Ctx): Record<string, unknown> {
  const out = { ...data };
  if (platform === 'instagram') out.hashtags = normalizeHashtags(out.hashtags as string[], c.settings.seo.maxInstagramHashtags);
  if (platform === 'facebook') out.hashtags = normalizeHashtags(out.hashtags as string[], 5);
  if (platform === 'website') {
    out.slug = slugify(String(out.slug || out.h1 || out.seoTitle));
    out.articleHtml = sanitizeHtml(String(out.articleHtml));
  }
  return out;
}

async function generatePlatform(platform: Platform, c: Ctx, opts: { feedback?: string[]; existing?: unknown; instruction?: string } = {}): Promise<Record<string, unknown>> {
  const schema = platformSchemas[platform] as unknown as z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>;
  let prompt = basePrompt(platform, c, opts.feedback);
  if (opts.existing) prompt = regeneratePlatformPrompt({ base: prompt, current: opts.existing, instruction: opts.instruction });
  const out = await generateStructured(c.provider, schema, { system: PLATFORM_SYSTEM, prompt, temperature: 0.8, maxOutputTokens: platform === 'website' ? 12000 : 4000 });
  return postProcess(platform, out, c);
}

export async function qualityCheck(c: Ctx, content: PlatformContent, attempts: number): Promise<QualityReport> {
  const rules = ruleBasedChecks(content, c.settings, c.brand);
  let llmIssues: QualityIssue[] = [];
  try {
    const out = await generateStructured(c.provider, qualityOutput, {
      system: QUALITY_SYSTEM, prompt: qualityPrompt(c.analysis, c.brand, c.seo, content), temperature: 0, maxOutputTokens: 4000,
    });
    llmIssues = out.issues;
  } catch (e) {
    llmIssues = [{ severity: 'warning', platform: 'all', message: `Automated fact check could not run (${(e as Error).message}). Review manually.` }];
  }
  const issues = [...rules, ...llmIssues];
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  return { passed: errors === 0, score: Math.max(0, 100 - errors * 20 - warnings * 5), issues, attempts, checkedAt: nowIso() };
}

function feedbackFor(platform: Platform, report: QualityReport): string[] {
  return report.issues.filter((i) => i.severity === 'error' && (i.platform === platform || i.platform === 'all')).map((i) => `${i.field ? i.field + ': ' : ''}${i.message}`);
}

export async function createPendingContent(userId: string, input: { videoId: string; seoId: string; brandId: string | null; platforms: Platform[] }): Promise<GeneratedContent> {
  const video = await getOwned<VideoDoc>(COLLECTIONS.videos, input.videoId, userId);
  const seo = await getOwned<SEOAnalysis>(COLLECTIONS.seoAnalyses, input.seoId, userId);
  if (seo.videoId !== video.id) throw badRequest('SEO analysis does not belong to this video');
  if (seo.status !== 'ready') throw new AppError('CONTENT_NOT_READY', 'Wait for SEO analysis to finish', 409);
  if (!video.analysisId) throw new AppError('CONTENT_NOT_READY', 'Video analysis is missing', 409);
  if (input.brandId) await getOwned<Brand>(COLLECTIONS.brands, input.brandId, userId);
  const id = newId(COLLECTIONS.content);
  const now = nowIso();
  const doc: Omit<GeneratedContent, 'id'> = {
    userId, videoId: video.id, brandId: input.brandId, analysisId: video.analysisId, seoId: seo.id,
    title: video.filename, status: 'generating', platforms: input.platforms, content: {}, version: 0,
    quality: null, needsReview: false, thumbnailUrl: video.thumbnailUrl, createdAt: now, updatedAt: now,
  };
  await setDoc(COLLECTIONS.content, id, doc);
  return { id, ...doc };
}

async function writeVersion(c: GeneratedContent, content: PlatformContent, reason: ContentVersion['reason'], instruction?: string): Promise<number> {
  const version = c.version + 1;
  const id = newId(COLLECTIONS.contentVersions);
  const v: Omit<ContentVersion, 'id'> = { userId: c.userId, contentId: c.id, version, content, reason, instruction, createdAt: nowIso() };
  await setDoc(COLLECTIONS.contentVersions, id, v);
  return version;
}

export async function runContentGeneration(userId: string, contentId: string, requestId: string): Promise<GeneratedContent> {
  const doc = await getOwned<GeneratedContent>(COLLECTIONS.content, contentId, userId);
  const c = await loadCtx(userId, doc.analysisId, doc.seoId, doc.brandId);
  const content: PlatformContent = {};
  let pending: Platform[] = [...doc.platforms];
  let feedback: Partial<Record<Platform, string[]>> = {};
  let report: QualityReport | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const results = await Promise.all(pending.map(async (p) => [p, await generatePlatform(p, c, { feedback: feedback[p] })] as const));
    for (const [p, data] of results) (content as Record<string, unknown>)[p] = data;
    report = await qualityCheck(c, content, attempt);
    if (report.passed) break;
    pending = doc.platforms.filter((p) => feedbackFor(p, report!).length > 0);
    if (pending.length === 0) break;
    feedback = Object.fromEntries(pending.map((p) => [p, feedbackFor(p, report!)]));
  }

  const title = content.website?.h1 ?? content.facebook?.title ?? c.analysis.titleSuggestion;
  const version = await writeVersion(doc, content, 'generated');
  const update = { content, title, status: 'ready', quality: report, needsReview: !report?.passed, version, error: null };
  await patchDoc(COLLECTIONS.content, contentId, update);
  await logActivity(userId, 'content.generated', 'content', contentId, `Generated content for ${title}`, { requestId, quality: report?.score, needsReview: !report?.passed });
  return { ...doc, ...update, status: 'ready', error: undefined, updatedAt: nowIso() } as GeneratedContent;
}

export const editSchemas = {
  instagram: platformSchemas.instagram,
  facebook: platformSchemas.facebook,
  website: platformSchemas.website,
};

export async function updateContent(userId: string, id: string, body: { title?: string; content?: PlatformContent }): Promise<GeneratedContent> {
  const doc = await getOwned<GeneratedContent>(COLLECTIONS.content, id, userId);
  if (doc.status === 'publishing') throw new AppError('CONFLICT', 'This content is being published. Wait until it finishes before editing.', 409);
  const next: PlatformContent = { ...doc.content };
  for (const p of ['instagram', 'facebook', 'website'] as const) {
    const incoming = body.content?.[p];
    if (!incoming) continue;
    if (!doc.platforms.includes(p)) throw badRequest(`${p} is not enabled for this content`);
    const parsed = editSchemas[p].safeParse(incoming);
    if (!parsed.success) throw new AppError('VALIDATION_ERROR', `Invalid ${p} content`, 400, parsed.error.issues.map((i) => ({ path: `${p}.${i.path.join('.')}`, message: i.message })));
    const clean = { ...parsed.data } as Record<string, unknown>;
    if (p === 'instagram') clean.hashtags = normalizeHashtags(clean.hashtags as string[], 30);
    if (p === 'facebook') clean.hashtags = normalizeHashtags(clean.hashtags as string[], 10);
    if (p === 'website') {
      clean.slug = slugify(String(clean.slug));
      clean.articleHtml = sanitizeHtml(String(clean.articleHtml));
    }
    (next as Record<string, unknown>)[p] = clean;
  }
  const settings = await getSettings(userId);
  const brand = doc.brandId ? await getById<Brand>(COLLECTIONS.brands, doc.brandId) : null;
  const rules = ruleBasedChecks(next, settings, brand);
  const errors = rules.filter((i) => i.severity === 'error').length;
  const quality: QualityReport = { passed: errors === 0, score: Math.max(0, 100 - errors * 20 - (rules.length - errors) * 5), issues: rules, attempts: doc.quality?.attempts ?? 0, checkedAt: nowIso() };
  const version = await writeVersion(doc, next, 'edited');
  const update = { content: next, title: body.title ?? doc.title, version, quality, needsReview: !quality.passed, status: doc.status === 'draft' || doc.status === 'failed' ? 'ready' : doc.status };
  await patchDoc(COLLECTIONS.content, id, update);
  await logActivity(userId, 'content.edited', 'content', id, `Edited ${update.title}`, { version });
  return { ...doc, ...update } as GeneratedContent;
}

export interface RegenerateInput {
  contentId: string;
  scope: 'all' | 'platform' | 'field';
  platform?: Platform;
  field?: string;
  instruction?: string;
}

export async function regenerate(userId: string, input: RegenerateInput, requestId: string): Promise<GeneratedContent> {
  const doc = await getOwned<GeneratedContent>(COLLECTIONS.content, input.contentId, userId);
  if (doc.status === 'publishing') throw new AppError('CONFLICT', 'This content is being published. Wait until it finishes.', 409);
  const c = await loadCtx(userId, doc.analysisId, doc.seoId, doc.brandId);
  const next: PlatformContent = { ...doc.content };

  if (input.scope === 'all') {
    const results = await Promise.all(doc.platforms.map(async (p) => [p, await generatePlatform(p, c, { existing: doc.content[p], instruction: input.instruction })] as const));
    for (const [p, d] of results) (next as Record<string, unknown>)[p] = d;
  } else {
    const platform = input.platform;
    if (!platform || !doc.platforms.includes(platform)) throw badRequest('A valid platform is required');
    if (input.scope === 'platform') {
      (next as Record<string, unknown>)[platform] = await generatePlatform(platform, c, { existing: doc.content[platform], instruction: input.instruction });
    } else {
      const current = doc.content[platform] as Record<string, unknown> | undefined;
      const shape = (platformSchemas[platform] as unknown as z.ZodObject<z.ZodRawShape>).shape;
      if (!input.field || !(input.field in shape) || !current) throw badRequest('Unknown field for this platform');
      const out = await generateStructured(c.provider, fieldRegenOutput, {
        system: PLATFORM_SYSTEM, temperature: 0.8,
        prompt: regenerateFieldPrompt({ a: c.analysis, brand: c.brand, seo: c.seo, platform, field: input.field, current: current[input.field], fullPlatformContent: current, instruction: input.instruction }),
      });
      const checked = shape[input.field].safeParse(out.value);
      if (!checked.success) throw new AppError('AI_INVALID_OUTPUT', `The AI returned an invalid value for ${input.field}`, 502);
      (next as Record<string, unknown>)[platform] = postProcess(platform, { ...current, [input.field]: checked.data }, c);
    }
  }
  const report = await qualityCheck(c, next, (doc.quality?.attempts ?? 0) + 1);
  const version = await writeVersion(doc, next, 'regenerated', input.instruction);
  const update = { content: next, version, quality: report, needsReview: !report.passed, status: doc.status === 'draft' || doc.status === 'failed' ? 'ready' : doc.status };
  await patchDoc(COLLECTIONS.content, doc.id, update);
  await logActivity(userId, 'content.regenerated', 'content', doc.id, `Regenerated ${input.scope === 'all' ? 'all content' : `${input.platform}${input.field ? ' ' + input.field : ''}`}`, { requestId, instruction: input.instruction });
  return { ...doc, ...update } as GeneratedContent;
}

export async function listVersions(userId: string, contentId: string): Promise<ContentVersion[]> {
  await getOwned<GeneratedContent>(COLLECTIONS.content, contentId, userId);
  const snap = await col(COLLECTIONS.contentVersions).where('userId', '==', userId).where('contentId', '==', contentId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ContentVersion).sort((a, b) => b.version - a.version);
}

export async function restoreVersion(userId: string, contentId: string, versionId: string): Promise<GeneratedContent> {
  const doc = await getOwned<GeneratedContent>(COLLECTIONS.content, contentId, userId);
  if (doc.status === 'publishing') throw new AppError('CONFLICT', 'This content is being published.', 409);
  const v = await getOwned<ContentVersion>(COLLECTIONS.contentVersions, versionId, userId);
  if (v.contentId !== contentId) throw badRequest('Version does not belong to this content');
  const settings = await getSettings(userId);
  const brand = doc.brandId ? await getById<Brand>(COLLECTIONS.brands, doc.brandId) : null;
  const rules = ruleBasedChecks(v.content, settings, brand);
  const errors = rules.filter((i) => i.severity === 'error').length;
  const quality: QualityReport = { passed: errors === 0, score: Math.max(0, 100 - errors * 20 - (rules.length - errors) * 5), issues: rules, attempts: doc.quality?.attempts ?? 0, checkedAt: nowIso() };
  const version = await writeVersion(doc, v.content, 'restored', `Restored version ${v.version}`);
  const update = { content: v.content, version, quality, needsReview: !quality.passed };
  await patchDoc(COLLECTIONS.content, contentId, update);
  await logActivity(userId, 'content.restored', 'content', contentId, `Restored version ${v.version}`);
  return { ...doc, ...update } as GeneratedContent;
}

export async function duplicateContent(userId: string, id: string): Promise<GeneratedContent> {
  const doc = await getOwned<GeneratedContent>(COLLECTIONS.content, id, userId);
  const newDocId = newId(COLLECTIONS.content);
  const now = nowIso();
  const copy: Omit<GeneratedContent, 'id'> = { ...doc, title: `${doc.title} (copy)`, status: 'draft', version: 0, createdAt: now, updatedAt: now, publishedAt: undefined, error: undefined };
  delete (copy as Partial<GeneratedContent>).id;
  await setDoc(COLLECTIONS.content, newDocId, copy);
  const version = await writeVersion({ ...copy, id: newDocId } as GeneratedContent, copy.content, 'generated', `Duplicated from ${doc.id}`);
  await patchDoc(COLLECTIONS.content, newDocId, { version });
  await logActivity(userId, 'content.duplicated', 'content', newDocId, `Duplicated ${doc.title}`);
  return { id: newDocId, ...copy, version };
}

export async function deleteContent(userId: string, id: string): Promise<void> {
  const doc = await getOwned<GeneratedContent>(COLLECTIONS.content, id, userId);
  if (doc.status === 'publishing') throw new AppError('CONFLICT', 'This content is being published. Wait until it finishes.', 409);
  const [versions, scheduled] = await Promise.all([
    col(COLLECTIONS.contentVersions).where('userId', '==', userId).where('contentId', '==', id).get(),
    col(COLLECTIONS.scheduledPosts).where('userId', '==', userId).where('contentId', '==', id).where('status', '==', 'scheduled').get(),
  ]);
  await Promise.all([
    ...versions.docs.map((d) => d.ref.delete()),
    ...scheduled.docs.map((d) => d.ref.set({ status: 'cancelled', updatedAt: nowIso() }, { merge: true })),
    col(COLLECTIONS.content).doc(id).delete(),
  ]);
  await logActivity(userId, 'content.deleted', 'content', id, `Deleted ${doc.title}`);
}
