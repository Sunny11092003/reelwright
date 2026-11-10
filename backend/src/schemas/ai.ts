import { z } from 'zod';

const str = z.string().default('');
const strArr = z.array(z.string()).default([]);
const num = z.coerce.number().default(0);

export const videoAnalysisOutput = z.object({
  titleSuggestion: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string().min(1),
  transcript: str,
  language: z.string().default('en'),
  keywords: strArr,
  entities: z.array(z.object({ name: z.string(), type: z.string().default('other') })).default([]),
  audience: str,
  location: str,
  intent: str,
  brandMentions: strArr,
  callToAction: str,
  scenes: z
    .array(z.object({ startSeconds: num, endSeconds: num, description: z.string(), onScreenText: z.string().optional() }))
    .default([]),
  objects: strArr,
  people: strArr,
  actions: strArr,
  onScreenText: strArr,
  importantMoments: z.array(z.object({ atSeconds: num, description: z.string() })).default([]),
});
export type VideoAnalysisOutput = z.infer<typeof videoAnalysisOutput>;

export const seoOutput = z.object({
  primaryKeyword: z.string().min(1),
  secondaryKeywords: strArr,
  longTailKeywords: strArr,
  searchIntent: z.enum(['informational', 'navigational', 'commercial', 'transactional', 'local']).catch('informational'),
  relatedQueries: strArr,
  contentAngle: str,
  locationKeywords: strArr,
  questionKeywords: strArr,
  semanticKeywords: strArr,
  hashtags: strArr,
});
export type SeoOutput = z.infer<typeof seoOutput>;

export const instagramSchema = z.object({
  hook: z.string().min(1),
  caption: z.string().min(1),
  cta: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
  keywords: strArr,
  altText: str,
  coverText: str,
  shortCaption: str,
  longCaption: str,
});

export const facebookSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  caption: z.string().min(1),
  cta: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
});

export const websiteSchema = z.object({
  seoTitle: z.string().min(1),
  metaDescription: z.string().min(1),
  h1: z.string().min(1),
  slug: z.string().min(1),
  shortDescription: z.string().min(1),
  articleHtml: z.string().min(1),
  primaryKeyword: z.string().min(1),
  secondaryKeywords: strArr,
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  imageAltText: str,
  internalLinks: z.array(z.object({ anchor: z.string(), suggestion: z.string() })).default([]),
  externalReferences: z.array(z.object({ title: z.string(), note: z.string() })).default([]),
  schemaJsonLd: z.record(z.unknown()).default({}),
  categories: strArr,
  tags: strArr,
});

export const platformSchemas = {
  instagram: instagramSchema,
  facebook: facebookSchema,
  website: websiteSchema,
} as const;

export const qualityOutput = z.object({
  issues: z
    .array(
      z.object({
        severity: z.enum(['error', 'warning']).catch('warning'),
        platform: z.enum(['instagram', 'facebook', 'website', 'all']).catch('all'),
        field: z.string().optional(),
        message: z.string(),
      }),
    )
    .default([]),
});

export const fieldRegenOutput = z.object({ value: z.unknown() });

export const insightsOutput = z.object({ insights: z.array(z.string()).default([]) });
