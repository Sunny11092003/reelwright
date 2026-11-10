import { createPost, uploadMedia, type WpCredentials } from '../integrations/wordpress';
import { fetchWithTimeout } from '../utils/http';
import { AppError } from '../utils/errors';
import { escapeHtml } from '../utils/text';
import type { AccountWithSecret, PublishContext, PublishResult, SocialPublisher } from './types';
import { testConnection } from '../integrations/wordpress';
import { thumbnailUrl } from '../integrations/cloudinary';
import type { PlatformContent, UserSettings, VideoDoc } from '../shared/types';

const creds = (a: AccountWithSecret): WpCredentials => ({ siteUrl: a.account.siteUrl!, username: a.secret.username, applicationPassword: a.secret.applicationPassword });

const SEO_META_KEYS: Record<UserSettings['wordpress']['seoPlugin'], { title: string; desc: string; kw: string } | null> = {
  yoast: { title: '_yoast_wpseo_title', desc: '_yoast_wpseo_metadesc', kw: '_yoast_wpseo_focuskw' },
  rankmath: { title: 'rank_math_title', desc: 'rank_math_description', kw: 'rank_math_focus_keyword' },
  none: null,
};

export function buildArticleHtml(web: NonNullable<PlatformContent['website']>, video: VideoDoc, settings: UserSettings): string {
  const parts: string[] = [];
  if (settings.wordpress.embedVideo) {
    parts.push(`<figure class="wp-block-video"><video controls preload="metadata" poster="${escapeHtml(video.thumbnailUrl)}" src="${escapeHtml(video.url)}"></video></figure>`);
  }
  parts.push(web.articleHtml);
  if (web.faq.length) {
    parts.push('<h2>Frequently asked questions</h2>');
    for (const f of web.faq) parts.push(`<h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p>`);
  }
  if (settings.wordpress.includeSchema) {
    const schema: Record<string, unknown> = { ...web.schemaJsonLd };
    if (web.faq.length) {
      schema['@graph'] = [
        web.schemaJsonLd,
        { '@type': 'FAQPage', mainEntity: web.faq.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) },
      ];
      delete schema['@type'];
      schema['@context'] = 'https://schema.org';
    }
    parts.push(`<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`);
  }
  return parts.join('\n');
}

export const websitePublisher: SocialPublisher = {
  platform: 'website',

  validate(content) {
    const w = content.website;
    if (!w) throw new AppError('CONTENT_NOT_READY', 'No website content has been generated', 409);
    if (!w.seoTitle || !w.articleHtml || !w.slug) throw new AppError('CONTENT_NOT_READY', 'Website content is incomplete', 409);
  },

  async publish(ctx: PublishContext): Promise<PublishResult> {
    const c = creds(ctx.account);
    const web = ctx.content.website!;
    let featuredMediaId: number | undefined;

    await ctx.progress('Uploading featured image');
    try {
      const img = await fetchWithTimeout(thumbnailUrl(ctx.video.cloudinaryPublicId, 1280), { timeoutMs: 60_000 });
      if (!img.ok) throw new Error(`HTTP ${img.status}`);
      const media = await uploadMedia(c, Buffer.from(await img.arrayBuffer()), `${web.slug}.jpg`, 'image/jpeg', web.imageAltText || web.h1, web.h1);
      featuredMediaId = media.id;
    } catch (e) {
      if (e instanceof AppError && (e.code === 'WORDPRESS_AUTH')) throw e;
      ctx.log.warn('Featured image upload failed; continuing without it', { message: (e as Error).message });
    }

    await ctx.progress(ctx.options.wordpressStatus === 'draft' ? 'Saving draft' : 'Publishing post');
    const keys = SEO_META_KEYS[ctx.settings.wordpress.seoPlugin];
    const post = await createPost(c, {
      title: web.h1, slug: web.slug, excerpt: web.shortDescription,
      contentHtml: buildArticleHtml(web, ctx.video, ctx.settings),
      status: ctx.options.wordpressStatus ?? ctx.settings.publishing.wordpressStatus,
      categories: web.categories, tags: web.tags, featuredMediaId,
      meta: keys ? { [keys.title]: web.seoTitle, [keys.desc]: web.metaDescription, [keys.kw]: web.primaryKeyword } : undefined,
    });
    return { externalId: String(post.id), url: post.link };
  },

  async testConnection(acc: AccountWithSecret) {
    const r = await testConnection(creds(acc));
    if (!r.canPublish) return { ok: false, detail: `Connected as ${r.name}, but this user cannot publish posts. Use an Editor or Administrator account.` };
    return { ok: true, detail: `Connected to ${r.siteName} as ${r.name}` };
  },
};
