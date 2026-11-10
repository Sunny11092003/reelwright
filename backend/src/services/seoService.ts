import { COLLECTIONS } from '../shared/constants';
import type { Brand, SEOAnalysis, SEOContext, VideoAnalysis, VideoDoc } from '../shared/types';
import { getById, getOwned, logActivity, newId, nowIso, patchDoc, setDoc } from '../firebase/repo';
import { getTextProvider } from '../integrations/ai';
import { generateStructured } from '../integrations/ai/json';
import { seoOutput } from '../schemas/ai';
import { SEO_SYSTEM, seoPrompt } from '../prompts';
import { normalizeHashtags } from '../utils/text';
import { AppError } from '../utils/errors';
import { getSettings } from './settingsService';

export async function createPendingSeo(userId: string, videoId: string, context: SEOContext): Promise<SEOAnalysis> {
  const video = await getOwned<VideoDoc>(COLLECTIONS.videos, videoId, userId);
  if (video.status !== 'analyzed' || !video.analysisId) throw new AppError('CONTENT_NOT_READY', 'Analyze the video before running SEO analysis', 409);
  if (context.brandId) await getOwned<Brand>(COLLECTIONS.brands, context.brandId, userId);
  const id = newId(COLLECTIONS.seoAnalyses);
  const now = nowIso();
  const doc: Omit<SEOAnalysis, 'id'> = {
    userId, videoId, brandId: context.brandId, context, primaryKeyword: '', secondaryKeywords: [], longTailKeywords: [],
    searchIntent: 'informational', relatedQueries: [], contentAngle: '', locationKeywords: [], questionKeywords: [],
    semanticKeywords: [], hashtags: [], status: 'pending', provider: '', model: '', createdAt: now, updatedAt: now,
  };
  await setDoc(COLLECTIONS.seoAnalyses, id, doc);
  return { id, ...doc };
}

export async function runSeoAnalysis(userId: string, seoId: string, requestId: string): Promise<SEOAnalysis> {
  const seo = await getOwned<SEOAnalysis>(COLLECTIONS.seoAnalyses, seoId, userId);
  const video = await getOwned<VideoDoc>(COLLECTIONS.videos, seo.videoId, userId);
  const analysis = await getById<VideoAnalysis>(COLLECTIONS.videoAnalysis, video.analysisId ?? '');
  if (!analysis) throw new AppError('CONTENT_NOT_READY', 'Video analysis is missing', 409);
  const brand = seo.brandId ? await getById<Brand>(COLLECTIONS.brands, seo.brandId) : null;
  const settings = await getSettings(userId);
  const provider = getTextProvider(settings);
  const out = await generateStructured(provider, seoOutput, {
    system: SEO_SYSTEM, prompt: seoPrompt(analysis, brand, seo.context), temperature: 0.4,
  });
  const update = { ...out, hashtags: normalizeHashtags(out.hashtags, 20), status: 'ready' as const, provider: provider.name, model: provider.model, error: null };
  await patchDoc(COLLECTIONS.seoAnalyses, seoId, update);
  await logActivity(userId, 'seo.generated', 'seo', seoId, `SEO analysis for ${video.filename}`, { requestId, primaryKeyword: out.primaryKeyword });
  return { ...seo, ...update, error: undefined, updatedAt: nowIso() };
}
