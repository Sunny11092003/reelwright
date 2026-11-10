import { graph } from '../integrations/meta/graph';
import { publishableMp4Url } from '../integrations/cloudinary';
import { AppError } from '../utils/errors';
import { sleep, withRetry } from '../utils/http';
import type { PostMetrics } from '../shared/types';
import type { AccountWithSecret, PublishContext, PublishResult, SocialPublisher } from './types';

export const facebookPublisher: SocialPublisher = {
  platform: 'facebook',

  validate(content, video) {
    const fb = content.facebook;
    if (!fb) throw new AppError('CONTENT_NOT_READY', 'No Facebook content has been generated', 409);
    if (video.bytes > 10 * 1024 * 1024 * 1024) throw new AppError('PLATFORM_REQUIREMENT', 'Facebook videos must be 10 GB or smaller', 400);
  },

  async publish(ctx: PublishContext): Promise<PublishResult> {
    const { account, secret } = ctx.account;
    const token = secret.accessToken;
    const fb = ctx.content.facebook!;
    const description = [fb.caption, fb.description !== fb.caption ? fb.description : '', fb.cta, fb.hashtags.join(' ')].map((s) => s.trim()).filter(Boolean).join('\n\n');

    await ctx.progress('Preparing video for Facebook');
    const fileUrl = await publishableMp4Url(ctx.video.cloudinaryPublicId, ctx.video.format, ctx.video.url);

    await ctx.progress('Uploading video to Facebook');
    const created = await withRetry(() => graph<{ id: string }>('POST', `/${account.externalId}/videos`, { file_url: fileUrl, title: fb.title.slice(0, 100), description }, token, 300_000));

    await ctx.progress('Facebook is processing the video');
    const deadline = Date.now() + 15 * 60_000;
    let permalink: string | undefined;
    for (;;) {
      const s = await graph<{ status?: { video_status?: string; processing_progress?: number }; permalink_url?: string }>('GET', `/${created.id}`, { fields: 'status,permalink_url' }, token);
      permalink = s.permalink_url ?? permalink;
      const st = s.status?.video_status;
      if (st === 'ready') break;
      if (st === 'error') throw new AppError('META_API_ERROR', 'Facebook failed to process the video', 422);
      if (Date.now() > deadline) throw new AppError('META_API_ERROR', 'Timed out waiting for Facebook to process the video', 504, undefined, true);
      await sleep(5000);
    }
    return { externalId: created.id, url: permalink ? `https://www.facebook.com${permalink}` : `https://www.facebook.com/${created.id}` };
  },

  async testConnection(acc: AccountWithSecret) {
    const r = await graph<{ id: string; name?: string }>('GET', `/${acc.account.externalId}`, { fields: 'id,name' }, acc.secret.accessToken);
    return { ok: true, detail: `Facebook Page "${r.name ?? r.id}" is reachable` };
  },

  async fetchMetrics(acc: AccountWithSecret, videoId: string) {
    const token = acc.secret.accessToken;
    const metrics: PostMetrics = {};
    const notes: string[] = [];
    const metric = async (name: string, key: keyof PostMetrics) => {
      try {
        const r = await graph<{ data: { values?: { value: number }[] }[] }>('GET', `/${videoId}/video_insights`, { metric: name }, token);
        const v = r.data?.[0]?.values?.[0]?.value;
        if (typeof v === 'number') metrics[key] = v;
      } catch (e) {
        notes.push(`${name}: ${(e as Error).message}`);
      }
    };
    await Promise.all([
      metric('total_video_views', 'views'),
      metric('total_video_impressions_unique', 'reach'),
      (async () => {
        try {
          const r = await graph<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }>(
            'GET', `/${videoId}`, { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)' }, token);
          if (typeof r.reactions?.summary?.total_count === 'number') metrics.reactions = r.reactions.summary.total_count;
          if (typeof r.comments?.summary?.total_count === 'number') metrics.comments = r.comments.summary.total_count;
        } catch (e) {
          notes.push(`engagement: ${(e as Error).message}`);
        }
      })(),
    ]);
    return { metrics, note: Object.keys(metrics).length === 0 ? notes[0] : undefined };
  },
};
