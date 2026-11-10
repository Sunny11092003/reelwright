import { COLLECTIONS } from '../shared/constants';
import type { Brand, JobErrorInfo, VideoAnalysis, VideoDoc } from '../shared/types';
import { env } from '../config/env';
import { col, getById, getOwned, logActivity, newId, nowIso, patchDoc, setDoc } from '../firebase/repo';
import { deleteVideo, getVideoResource, thumbnailUrl } from '../integrations/cloudinary';
import { getVideoProvider } from '../integrations/ai';
import { videoAnalysisOutput } from '../schemas/ai';
import { VIDEO_ANALYSIS_SYSTEM, videoAnalysisPrompt } from '../prompts';
import { AppError, badRequest, toAppError } from '../utils/errors';
import { getSettings } from './settingsService';
import { generateStructuredVideo } from './videoAI';
import { createLogger } from '../utils/logger';

const log = createLogger('video');
const MIME: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo' };

export async function registerVideo(userId: string, input: { publicId: string; filename: string; brandId?: string | null; duration?: number }): Promise<VideoDoc> {
  const existing = await col(COLLECTIONS.videos).where('userId', '==', userId).where('cloudinaryPublicId', '==', input.publicId).limit(1).get();
  if (!existing.empty) return { id: existing.docs[0].id, ...existing.docs[0].data() } as VideoDoc;

  if (input.brandId) await getOwned<Brand>(COLLECTIONS.brands, input.brandId, userId);
  const r = await getVideoResource(userId, input.publicId, input.duration);
  if (r.bytes > env.MAX_UPLOAD_MB * 1024 * 1024) throw new AppError('INVALID_VIDEO', `Video exceeds the ${env.MAX_UPLOAD_MB} MB limit`, 422);
  if (r.duration < 3) throw new AppError('INVALID_VIDEO', 'Video must be at least 3 seconds long', 422);
  if (r.duration > 20 * 60) throw new AppError('INVALID_VIDEO', 'Video must be 20 minutes or shorter', 422);
  const mime = MIME[r.format.toLowerCase()];
  if (!mime) throw new AppError('INVALID_VIDEO', `Unsupported video format "${r.format}"`, 422);

  const id = newId(COLLECTIONS.videos);
  const now = nowIso();
  const doc: Omit<VideoDoc, 'id'> = {
    userId, brandId: input.brandId ?? null, filename: input.filename.slice(0, 200),
    cloudinaryPublicId: r.publicId, url: r.url, thumbnailUrl: thumbnailUrl(r.publicId), format: r.format, mimeType: mime,
    bytes: r.bytes, durationSeconds: r.duration, width: r.width, height: r.height,
    status: 'uploaded', createdAt: now, updatedAt: now,
  };
  await setDoc(COLLECTIONS.videos, id, doc);
  await logActivity(userId, 'video.uploaded', 'video', id, `Uploaded ${doc.filename}`);
  return { id, ...doc };
}

export async function deleteVideoCascade(userId: string, videoId: string): Promise<void> {
  const v = await getOwned<VideoDoc>(COLLECTIONS.videos, videoId, userId);
  const inUse = await col(COLLECTIONS.content).where('userId', '==', userId).where('videoId', '==', videoId).limit(1).get();
  if (!inUse.empty) throw new AppError('CONFLICT', 'This video has generated content. Delete the content first.', 409);
  await deleteVideo(v.cloudinaryPublicId).catch((e) => log.warn('Cloudinary delete failed', { message: String(e) }));
  const analyses = await col(COLLECTIONS.videoAnalysis).where('userId', '==', userId).where('videoId', '==', videoId).get();
  await Promise.all([...analyses.docs.map((d) => d.ref.delete()), col(COLLECTIONS.videos).doc(videoId).delete()]);
}

export function errorInfo(err: unknown, requestId: string, platform: JobErrorInfo['platform'] = 'system', retryCount = 0): JobErrorInfo {
  const e = toAppError(err);
  return { errorCode: e.code, errorMessage: e.message.slice(0, 500), platform, timestamp: nowIso(), requestId, retryCount };
}

export async function runVideoAnalysis(userId: string, videoId: string, requestId: string): Promise<VideoAnalysis> {
  const video = await getOwned<VideoDoc>(COLLECTIONS.videos, videoId, userId);
  const settings = await getSettings(userId);
  const brand = video.brandId ? await getById<Brand>(COLLECTIONS.brands, video.brandId) : null;
  await patchDoc(COLLECTIONS.videos, videoId, { status: 'analyzing', error: null });
  const provider = getVideoProvider(settings);
  const out = await generateStructuredVideo(provider, videoAnalysisOutput, {
    videoUrl: video.url, mimeType: video.mimeType, displayName: video.filename,
    system: VIDEO_ANALYSIS_SYSTEM, prompt: videoAnalysisPrompt(brand, video.durationSeconds),
  });
  const id = video.analysisId ?? newId(COLLECTIONS.videoAnalysis);
  const analysis: Omit<VideoAnalysis, 'id'> = { ...out, userId, videoId, provider: provider.name, model: provider.model, createdAt: nowIso() };
  await setDoc(COLLECTIONS.videoAnalysis, id, analysis);
  await patchDoc(COLLECTIONS.videos, videoId, { status: 'analyzed', analysisId: id, error: null });
  await logActivity(userId, 'video.analyzed', 'video', videoId, `Analyzed ${video.filename}`, { requestId });
  return { id, ...analysis };
}
