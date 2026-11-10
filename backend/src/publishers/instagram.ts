import { graph } from '../integrations/meta/graph';
import { publishableMp4Url } from '../integrations/cloudinary';
import { AppError } from '../utils/errors';
import { sleep, withRetry } from '../utils/http';
import type { PlatformContent, PostMetrics } from '../shared/types';
import type { AccountWithSecret, PublishContext, PublishResult, SocialPublisher } from './types';

export function buildInstagramCaption(ig: NonNullable<PlatformContent['instagram']>): string {
  return [ig.hook, ig.caption, ig.cta, ig.hashtags.join(' ')].map((s) => s.trim()).filter(Boolean).join('\n\n');
}

export const instagramPublisher: SocialPublisher = {
  platform: 'instagram',

  validate(content, video) {
    if (!content.instagram) throw new AppError('CONTENT_NOT_READY', 'No Instagram content has been generated', 409);
    const caption = buildInstagramCaption(content.instagram);
    if (caption.length > 2200) throw new AppError('PLATFORM_REQUIREMENT', 'Instagram captions are limited to 2200 characters', 400);
    if (content.instagram.hashtags.length > 30) throw new AppError('PLATFORM_REQUIREMENT', 'Instagram allows at most 30 hashtags', 400);
    if (video.durationSeconds < 3) throw new AppError('PLATFORM_REQUIREMENT', 'Instagram Reels must be at least 3 seconds long', 400);
    if (video.durationSeconds > 15 * 60) throw new AppError('PLATFORM_REQUIREMENT', 'Instagram Reels can be at most 15 minutes long', 400);
    if (video.bytes > 300 * 1024 * 1024) throw new AppError('PLATFORM_REQUIREMENT', 'Instagram Reels must be 300 MB or smaller', 400);
  },

  async publish(ctx: PublishContext): Promise<PublishResult> {
    const { account, secret } = ctx.account;
    const token = secret.accessToken;
    const igId = account.externalId;
    const caption = buildInstagramCaption(ctx.content.instagram!);

    await ctx.progress('Preparing video for Instagram');
    const videoUrl = await publishableMp4Url(ctx.video.cloudinaryPublicId, ctx.video.format, ctx.video.url);

    await ctx.progress('Creating Reel container');
    const container = await withRetry(() => graph<{ id: string }>('POST', `/${igId}/media`, { media_type: 'REELS', video_url: videoUrl, caption, share_to_feed: true }, token));

    await ctx.progress('Instagram is processing the video');
    const deadline = Date.now() + 10 * 60_000;
    for (;;) {
      const s = await graph<{ status_code?: string; status?: string }>('GET', `/${container.id}`, { fields: 'status_code,status' }, token);
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
        throw new AppError('META_API_ERROR', `Instagram could not process the video (${s.status_code}${s.status ? ': ' + s.status : ''}). Use H.264/AAC MP4, 9:16, 3s-15min.`, 422);
      }
      if (Date.now() > deadline) throw new AppError('META_API_ERROR', 'Timed out waiting for Instagram to process the video', 504, undefined, true);
      await sleep(5000);
    }

    await ctx.progress('Publishing Reel');
    const published = await withRetry(() => graph<{ id: string }>('POST', `/${igId}/media_publish`, { creation_id: container.id }, token));
    const info = await graph<{ permalink?: string }>('GET', `/${published.id}`, { fields: 'permalink' }, token).catch(() => ({ permalink: undefined }));
    return { externalId: published.id, url: info.permalink };
  },

  async testConnection(acc: AccountWithSecret) {
    const r = await graph<{ id: string; username?: string }>('GET', `/${acc.account.externalId}`, { fields: 'id,username' }, acc.secret.accessToken);
    return { ok: true, detail: `Instagram account @${r.username ?? r.id} is reachable` };
  },

  async fetchMetrics(acc: AccountWithSecret, mediaId: string) {
    const metrics: PostMetrics = {};
    const wanted: [keyof PostMetrics, string][] = [['views', 'views'], ['reach', 'reach'], ['likes', 'likes'], ['comments', 'comments'], ['shares', 'shares'], ['saves', 'saved']];
    const notes: string[] = [];
    await Promise.all(wanted.map(async ([key, metric]) => {
      try {
        const r = await graph<{ data: { values?: { value: number }[]; total_value?: { value: number } }[] }>('GET', `/${mediaId}/insights`, { metric }, acc.secret.accessToken);
        const d = r.data?.[0];
        const v = d?.total_value?.value ?? d?.values?.[0]?.value;
        if (typeof v === 'number') metrics[key] = v;
      } catch (e) {
        notes.push(`${metric}: ${(e as Error).message}`);
      }
    }));
    return { metrics, note: Object.keys(metrics).length === 0 ? notes[0] : undefined };
  },
};
