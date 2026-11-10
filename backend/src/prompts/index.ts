import type { Brand, SEOAnalysis, UserSettings, VideoAnalysis, Platform } from '../shared/types';

/** Prompt templates. Each pipeline stage has its own system prompt and builder so stages stay small and testable. */

export const SYSTEM_BASE = `You are a senior content strategist and SEO editor. You work only from the facts provided.
Rules you never break:
- Never invent facts, statistics, prices, awards, certifications, testimonials, phone numbers, addresses or claims that are not supported by the video analysis or brand profile.
- If a detail is unknown, leave it out instead of guessing.
- Write natural prose for humans. Do not stuff keywords. Use the primary keyword where it reads naturally.
- Respect the brand's tone and never use forbidden words.
- Output valid JSON only, matching the requested shape exactly.`;

export function brandBlock(brand: Brand | null): string {
  if (!brand) return 'BRAND PROFILE: none selected. Do not invent a brand name; refer to the speaker or organisation only if the video names it.';
  return `BRAND PROFILE (authoritative):
- Name: ${brand.name}
- Description: ${brand.description || 'n/a'}
- Website: ${brand.website || 'n/a'}
- Industry: ${brand.industry || 'n/a'}
- Location: ${[brand.city, brand.country].filter(Boolean).join(', ') || 'n/a'}
- Target audience: ${brand.targetAudience || 'n/a'}
- Tone: ${brand.tone || 'n/a'}
- Brand keywords: ${brand.keywords.join(', ') || 'n/a'}
- Forbidden words (never use): ${brand.forbiddenWords.join(', ') || 'none'}
- Preferred CTA: ${brand.preferredCta || 'n/a'}
- Social handles: ${Object.entries(brand.socialHandles).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ') || 'n/a'}`;
}

export const VIDEO_ANALYSIS_SYSTEM = `You are a meticulous video analyst. You watch and listen to the whole video and report only what is actually present.
Never guess names, locations or brands that are not spoken, shown or written on screen. Use empty strings or arrays when something is not present.
Output valid JSON only.`;

export function videoAnalysisPrompt(brand: Brand | null, durationSeconds: number): string {
  return `Analyze this video (duration about ${Math.round(durationSeconds)} seconds).

${brandBlock(brand)}
(The brand profile is context for interpreting the video. Do not claim the video mentions the brand unless it does.)

Return JSON with exactly these keys:
{
  "titleSuggestion": string,           // concise, descriptive working title
  "topic": string,                      // main subject in one sentence
  "summary": string,                    // 3-5 sentence factual summary
  "transcript": string,                 // full verbatim transcript of speech; empty string if no speech
  "language": string,                   // ISO 639-1 code of the spoken language, or "en" if none
  "keywords": string[],                 // 8-15 topical keywords actually relevant to the content
  "entities": [{"name": string, "type": "person"|"organization"|"place"|"product"|"event"|"other"}],
  "audience": string,                   // who this video is for, inferred from content
  "location": string,                   // location shown or mentioned; empty if unknown
  "intent": string,                     // purpose: educate, promote, announce, inspire, etc.
  "brandMentions": string[],            // brand names spoken or visible
  "callToAction": string,               // CTA in the video, or empty string
  "scenes": [{"startSeconds": number, "endSeconds": number, "description": string, "onScreenText": string}],
  "objects": string[],
  "people": string[],                   // roles/descriptions only, never identify real people by face
  "actions": string[],
  "onScreenText": string[],             // all legible text overlays and signs
  "importantMoments": [{"atSeconds": number, "description": string}]
}`;
}

export function analysisBlock(a: VideoAnalysis): string {
  return `VIDEO ANALYSIS (ground truth):
- Title idea: ${a.titleSuggestion}
- Topic: ${a.topic}
- Summary: ${a.summary}
- Language spoken: ${a.language}
- Audience: ${a.audience || 'n/a'}
- Location: ${a.location || 'n/a'}
- Intent: ${a.intent || 'n/a'}
- Brand mentions: ${a.brandMentions.join(', ') || 'none'}
- Call to action in video: ${a.callToAction || 'none'}
- On-screen text: ${a.onScreenText.join(' | ') || 'none'}
- Key moments: ${a.importantMoments.map((m) => `${m.atSeconds}s ${m.description}`).join(' | ') || 'n/a'}
- Keywords: ${a.keywords.join(', ')}
- Transcript: ${a.transcript ? a.transcript.slice(0, 6000) : '(no speech)'}`;
}

export const SEO_SYSTEM = `${SYSTEM_BASE}
You are the SEO research stage. You do not have access to live search volume data, so never state search volumes or rankings. Propose keywords based on semantic relevance, typical user phrasing and local intent.`;

export function seoPrompt(a: VideoAnalysis, brand: Brand | null, ctx: { country: string; city: string; audience: string; industry: string; language: string; goal: string; brand: string }): string {
  return `${analysisBlock(a)}

${brandBlock(brand)}

SEO CONTEXT SET BY THE USER:
- Brand: ${ctx.brand || 'n/a'}
- Country: ${ctx.country || 'n/a'}
- City: ${ctx.city || 'n/a'}
- Target audience: ${ctx.audience || 'n/a'}
- Industry: ${ctx.industry || 'n/a'}
- Output language: ${ctx.language}
- SEO goal: ${ctx.goal || 'increase organic discovery'}

Task: produce an SEO plan for content built from this video. Write all keywords in ${ctx.language}.
Return JSON:
{
  "primaryKeyword": string,
  "secondaryKeywords": string[],     // 4-8
  "longTailKeywords": string[],      // 5-10 natural multi-word phrases
  "searchIntent": "informational"|"navigational"|"commercial"|"transactional"|"local",
  "relatedQueries": string[],        // 5-10 queries people might search
  "contentAngle": string,            // 1-2 sentences: the angle that serves the audience and goal
  "locationKeywords": string[],      // only if a city/region is relevant
  "questionKeywords": string[],      // 4-8 question-form queries
  "semanticKeywords": string[],      // related concepts and entities
  "hashtags": string[]               // 8-15 hashtags starting with #, mix of broad and niche, no spaces
}`;
}

export const PLATFORM_SYSTEM = SYSTEM_BASE;

function seoBlock(s: SEOAnalysis): string {
  return `SEO PLAN:
- Primary keyword: ${s.primaryKeyword}
- Secondary: ${s.secondaryKeywords.join(', ')}
- Long-tail: ${s.longTailKeywords.join(', ')}
- Intent: ${s.searchIntent}
- Angle: ${s.contentAngle}
- Location keywords: ${s.locationKeywords.join(', ') || 'none'}
- Question keywords: ${s.questionKeywords.join(', ')}
- Semantic: ${s.semanticKeywords.join(', ')}
- Suggested hashtags: ${s.hashtags.join(' ')}
- Output language: ${s.context.language}`;
}

export interface PlatformPromptInput {
  analysis: VideoAnalysis;
  seo: SEOAnalysis;
  brand: Brand | null;
  settings: UserSettings;
  feedback?: string[];
}

function feedbackBlock(f?: string[]): string {
  return f && f.length ? `\nFIX THESE PROBLEMS FROM THE PREVIOUS ATTEMPT:\n${f.map((x) => `- ${x}`).join('\n')}\n` : '';
}

export function instagramPrompt(i: PlatformPromptInput): string {
  return `${analysisBlock(i.analysis)}

${brandBlock(i.brand)}

${seoBlock(i.seo)}
${feedbackBlock(i.feedback)}
Write Instagram Reel content in ${i.seo.context.language}. Instagram style: a scroll-stopping first line, short paragraphs, conversational, emoji only where natural (max 3), CTA that fits the video. Do not copy sentences you would use on Facebook or a website.
Hashtags: ${Math.min(i.settings.seo.maxInstagramHashtags, 15)} at most, each starting with #, relevant to the video only.
Caption must stay under 2000 characters including hashtags.
Return JSON:
{
  "hook": string,            // first line, under 110 characters
  "caption": string,         // standard caption body (without hook, CTA or hashtags)
  "cta": string,
  "hashtags": string[],
  "keywords": string[],      // search keywords naturally covered in the caption
  "altText": string,         // accessibility description of the video, under 125 characters
  "coverText": string,       // 3-6 words to overlay on the cover frame
  "shortCaption": string,    // complete 1-2 line version
  "longCaption": string      // complete longer storytelling version, no hashtags
}`;
}

export function facebookPrompt(i: PlatformPromptInput): string {
  return `${analysisBlock(i.analysis)}

${brandBlock(i.brand)}

${seoBlock(i.seo)}
${feedbackBlock(i.feedback)}
Write a Facebook video post in ${i.seo.context.language}. Facebook style: informative and community-oriented, slightly longer sentences than Instagram, speaks to families/community where relevant, 0-3 hashtags. It must read differently from the Instagram version: different opening, different structure.
Return JSON:
{
  "title": string,         // video title, under 90 characters
  "description": string,   // 2-4 sentence video description
  "caption": string,       // post text shown above the video
  "cta": string,
  "hashtags": string[]     // 0-3 hashtags starting with #
}`;
}

export function websitePrompt(i: PlatformPromptInput): string {
  return `${analysisBlock(i.analysis)}

${brandBlock(i.brand)}

${seoBlock(i.seo)}
${feedbackBlock(i.feedback)}
Write a helpful, readable website article in ${i.seo.context.language} based on the video. Treat the video as a source; expand with general, well-established context only when you are certain it is accurate, and never invent facts about the brand.
Constraints:
- seoTitle at most ${i.settings.seo.titleMaxLength} characters, containing the primary keyword naturally.
- metaDescription at most ${i.settings.seo.metaMaxLength} characters, compelling and accurate.
- slug: lowercase ascii, hyphen separated, max 70 characters.
- articleHtml: clean HTML using <h2>, <h3>, <p>, <ul>, <li>, <strong>. No <h1> (the CMS renders the title). 600-1000 words. Primary keyword density must stay natural (under 2%). Include a short FAQ-style closing only through the faq field, not duplicated in the article.
- faq: 3-5 real questions with direct answers supported by the video or common knowledge.
- internalLinks: suggestions of page types to link to (anchor text and which page), never invented URLs.
- externalReferences: kinds of authoritative sources worth citing (title and why). Do not fabricate URLs or specific publications you are not sure exist.
- schemaJsonLd: a valid schema.org object (Article, plus VideoObject facts only if known). Omit unknown properties.
- categories: 1-2 broad categories. tags: 3-6 tags.
Return JSON:
{
  "seoTitle": string, "metaDescription": string, "h1": string, "slug": string, "shortDescription": string,
  "articleHtml": string, "primaryKeyword": string, "secondaryKeywords": string[],
  "faq": [{"question": string, "answer": string}], "imageAltText": string,
  "internalLinks": [{"anchor": string, "suggestion": string}],
  "externalReferences": [{"title": string, "note": string}],
  "schemaJsonLd": object, "categories": string[], "tags": string[]
}`;
}

export const QUALITY_SYSTEM = `You are a strict fact-checking editor and SEO reviewer. You compare generated social and web content to the source analysis of a video and the brand profile.
Flag only real problems. Output valid JSON only.`;

export function qualityPrompt(a: VideoAnalysis, brand: Brand | null, seo: SEOAnalysis, content: unknown): string {
  return `${analysisBlock(a)}

${brandBlock(brand)}

Primary keyword: ${seo.primaryKeyword}

GENERATED CONTENT TO REVIEW:
${JSON.stringify(content, null, 2)}

Check each platform for:
1. Content matches what is actually in the video (topic, audience, location).
2. Unsupported claims or hallucinated facts (statistics, prices, credentials, awards, guarantees, contact details, names) not present in the analysis or brand profile. These are "error".
3. Keyword stuffing or unnatural repetition.
4. Hashtags irrelevant to the video.
5. Brand name, website, handles or location contradicting the brand profile. Forbidden words used. These are "error".
6. Platform style: Instagram is punchy and short-paragraph; Facebook is community-oriented; the website is informative. Content copied verbatim across platforms is a "warning".
Return JSON: {"issues": [{"severity": "error"|"warning", "platform": "instagram"|"facebook"|"website"|"all", "field": string, "message": string}]}
Return an empty issues array when everything is fine.`;
}

export function regenerateFieldPrompt(args: {
  a: VideoAnalysis; brand: Brand | null; seo: SEOAnalysis; platform: Platform; field: string; current: unknown; fullPlatformContent: unknown; instruction?: string;
}): string {
  return `${analysisBlock(args.a)}

${brandBlock(args.brand)}

${seoBlock(args.seo)}

CURRENT ${args.platform.toUpperCase()} CONTENT:
${JSON.stringify(args.fullPlatformContent, null, 2)}

Rewrite only the field "${args.field}". Current value:
${JSON.stringify(args.current)}

User instruction: ${args.instruction?.trim() || 'Produce a fresh alternative that is better and different in wording.'}
Keep the same JSON type as the current value. Keep consistency with the other fields. Do not add unsupported facts.
Return JSON: {"value": <new value>}`;
}

export function regeneratePlatformPrompt(args: { base: string; current: unknown; instruction?: string }): string {
  return `${args.base}

EXISTING CONTENT FOR THIS PLATFORM (use as context, improve it):
${JSON.stringify(args.current, null, 2)}

User instruction: ${args.instruction?.trim() || 'Produce a fresh alternative that is better and different in wording.'}`;
}

export const INSIGHTS_SYSTEM = `You are an analytics assistant. You describe patterns that are visible in the provided real metrics and nothing else.
Rules: never invent numbers; cite only figures present in the data; use cautious wording ("tended to", "in this sample"); never claim causation; if the sample is small say so. Output valid JSON only.`;

export function insightsPrompt(rows: unknown[]): string {
  return `Here are real post metrics with content features:
${JSON.stringify(rows, null, 2)}
Write 3-5 short insights (one sentence each) about patterns across these posts, for example caption length, hashtag count, platform, or topic versus views, reach and engagement. Only include a pattern if the data supports it.
Return JSON: {"insights": string[]}`;
}
