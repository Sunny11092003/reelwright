import { z } from 'zod';

const id = z.string().min(1).max(200);
export const platformEnum = z.enum(['instagram', 'facebook', 'website']);
const strList = z.array(z.string().trim().min(1).max(100)).max(50).default([]);

export const idParams = z.object({ id });

export const uploadRegisterBody = z.object({ publicId: z.string().min(3).max(400), filename: z.string().min(1).max(300), brandId: id.nullish(), duration: z.number().positive().max(86400).optional() });
export const analyzeVideoBody = z.object({ videoId: id });

export const seoContext = z.object({
  brandId: id.nullable().default(null),
  brand: z.string().max(120).default(''),
  country: z.string().max(80).default(''),
  city: z.string().max(80).default(''),
  audience: z.string().max(300).default(''),
  industry: z.string().max(120).default(''),
  language: z.string().min(2).max(40).default('en'),
  goal: z.string().max(300).default(''),
});
export const seoAnalyzeBody = z.object({ videoId: id, context: seoContext });

export const generateBody = z.object({
  videoId: id, seoId: id, brandId: id.nullable().default(null),
  platforms: z.array(platformEnum).min(1).max(3).refine((a) => new Set(a).size === a.length, 'Duplicate platforms'),
});

export const regenerateBody = z.object({
  contentId: id,
  scope: z.enum(['all', 'platform', 'field']),
  platform: platformEnum.optional(),
  field: z.string().max(60).optional(),
  instruction: z.string().max(600).optional(),
});

const igEdit = z.object({
  hook: z.string().max(300), caption: z.string().max(2200), cta: z.string().max(300), hashtags: z.array(z.string().max(100)).max(30),
  keywords: z.array(z.string().max(100)).max(40), altText: z.string().max(300), coverText: z.string().max(100),
  shortCaption: z.string().max(600), longCaption: z.string().max(2200),
});
const fbEdit = z.object({ title: z.string().max(200), description: z.string().max(2000), caption: z.string().max(5000), cta: z.string().max(300), hashtags: z.array(z.string().max(100)).max(10) });
const webEdit = z.object({
  seoTitle: z.string().max(120), metaDescription: z.string().max(320), h1: z.string().max(200), slug: z.string().max(120),
  shortDescription: z.string().max(600), articleHtml: z.string().max(200_000), primaryKeyword: z.string().max(120),
  secondaryKeywords: z.array(z.string().max(120)).max(40), faq: z.array(z.object({ question: z.string().max(300), answer: z.string().max(2000) })).max(20),
  imageAltText: z.string().max(300), internalLinks: z.array(z.object({ anchor: z.string().max(200), suggestion: z.string().max(400) })).max(20),
  externalReferences: z.array(z.object({ title: z.string().max(200), note: z.string().max(400) })).max(20),
  schemaJsonLd: z.record(z.unknown()), categories: z.array(z.string().max(80)).max(10), tags: z.array(z.string().max(80)).max(20),
});
export const updateContentBody = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.object({ instagram: igEdit.optional(), facebook: fbEdit.optional(), website: webEdit.optional() }).optional(),
});
export const restoreBody = z.object({ versionId: id });

export const contentListQuery = z.object({
  q: z.string().max(200).optional(), status: z.string().max(30).optional(), platform: platformEnum.optional(), brandId: id.optional(),
  from: z.string().max(40).optional(), to: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(500).default(200),
});

const target = z.object({ platform: platformEnum, accountId: id });
const options = z.object({ wordpressStatus: z.enum(['publish', 'draft']).optional() }).default({});
export const publishBody = z.object({ contentId: id, targets: z.array(target).min(1).max(3), options });
export const scheduleBody = z.object({ contentId: id, targets: z.array(target).min(1).max(3), scheduledAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(60), options });
export const retryBody = z.object({ jobId: id });
export const jobsQuery = z.object({ contentId: id.optional(), status: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

export const connectBody = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('meta') }),
  z.object({ provider: z.literal('wordpress'), siteUrl: z.string().url().max(300), username: z.string().min(1).max(120), applicationPassword: z.string().min(8).max(200) }),
]);

export const brandBody = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().max(2000).default(''), website: z.string().max(300).default(''),
  industry: z.string().max(120).default(''), country: z.string().max(80).default(''), city: z.string().max(80).default(''),
  targetAudience: z.string().max(500).default(''), tone: z.string().max(300).default(''), keywords: strList, forbiddenWords: strList,
  preferredCta: z.string().max(300).default(''),
  socialHandles: z.object({ instagram: z.string().max(100).optional(), facebook: z.string().max(100).optional(), x: z.string().max(100).optional(), linkedin: z.string().max(100).optional(), youtube: z.string().max(100).optional() }).default({}),
  logoUrl: z.string().max(500).optional(), colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8).default([]),
});

export const settingsBody = z.object({
  aiProvider: z.enum(['gemini', 'anthropic']).optional(), aiModel: z.string().max(100).optional(), defaultLanguage: z.string().max(40).optional(),
  defaultCountry: z.string().max(80).optional(), defaultTimezone: z.string().max(60).optional(), defaultBrandId: id.nullable().optional(),
  executionMode: z.enum(['n8n', 'direct']).optional(),
  seo: z.object({ titleMaxLength: z.number().int().min(30).max(100), metaMaxLength: z.number().int().min(80).max(320), maxInstagramHashtags: z.number().int().min(0).max(30), goal: z.string().max(300) }).partial().optional(),
  publishing: z.object({ defaultPlatforms: z.array(platformEnum).max(3), wordpressStatus: z.enum(['publish', 'draft']) }).partial().optional(),
  wordpress: z.object({ seoPlugin: z.enum(['yoast', 'rankmath', 'none']), includeSchema: z.boolean(), embedVideo: z.boolean() }).partial().optional(),
});

export const analyticsQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export const webhookBody = z.object({
  event: z.enum(['stage.completed', 'stage.failed']),
  stage: z.enum(['video-analysis', 'seo-analysis', 'content-generation', 'publishing', 'analytics-sync']),
  userId: id, resourceId: id, requestId: z.string().max(100).optional(),
  error: z.object({ code: z.string().max(80).optional(), message: z.string().max(1000).optional() }).optional(),
});
export const internalRunBody = z.object({ userId: id, resourceId: id, requestId: z.string().max(100).default('n8n') });
