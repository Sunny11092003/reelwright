import type { PlatformContent, QualityIssue, UserSettings, Brand } from '../shared/types';

const stripHtml = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function keywordDensityPercent(text: string, keyword: string): number {
  const words = wordCount(text);
  if (!words || !keyword.trim()) return 0;
  const re = new RegExp(keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const hits = (text.match(re) ?? []).length;
  return (hits * wordCount(keyword)) / words * 100;
}

/** Deterministic checks that don't need an LLM. */
export function ruleBasedChecks(content: PlatformContent, settings: UserSettings, brand: Brand | null): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const forbidden = (brand?.forbiddenWords ?? []).map((w) => w.toLowerCase()).filter(Boolean);
  const textOf = JSON.stringify(content).toLowerCase();
  for (const w of forbidden) {
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(textOf)) {
      issues.push({ severity: 'error', platform: 'all', message: `Uses the forbidden word "${w}".` });
    }
  }

  const ig = content.instagram;
  if (ig) {
    if (ig.hashtags.length > settings.seo.maxInstagramHashtags) issues.push({ severity: 'warning', platform: 'instagram', field: 'hashtags', message: `More than ${settings.seo.maxInstagramHashtags} hashtags.` });
    if (ig.hashtags.some((h) => !h.startsWith('#') || /\s/.test(h))) issues.push({ severity: 'warning', platform: 'instagram', field: 'hashtags', message: 'Hashtags must start with # and contain no spaces.' });
    const total = [ig.hook, ig.caption, ig.cta, ig.hashtags.join(' ')].join('\n\n').length;
    if (total > 2200) issues.push({ severity: 'error', platform: 'instagram', field: 'caption', message: `Assembled caption is ${total} characters; Instagram allows 2200.` });
    if (ig.altText.length > 125) issues.push({ severity: 'warning', platform: 'instagram', field: 'altText', message: 'Alt text is longer than 125 characters.' });
  }

  const fb = content.facebook;
  if (fb) {
    if (fb.title.length > 100) issues.push({ severity: 'warning', platform: 'facebook', field: 'title', message: 'Title is longer than 100 characters.' });
    if (fb.hashtags.length > 5) issues.push({ severity: 'warning', platform: 'facebook', field: 'hashtags', message: 'Facebook posts perform better with only a few hashtags.' });
  }
  if (fb && ig && fb.caption.trim().toLowerCase() === ig.caption.trim().toLowerCase()) {
    issues.push({ severity: 'error', platform: 'facebook', field: 'caption', message: 'Facebook caption is identical to the Instagram caption.' });
  }

  const web = content.website;
  if (web) {
    if (web.seoTitle.length > settings.seo.titleMaxLength) issues.push({ severity: 'error', platform: 'website', field: 'seoTitle', message: `SEO title is ${web.seoTitle.length} characters; keep it at or under ${settings.seo.titleMaxLength}.` });
    if (web.seoTitle.length < 20) issues.push({ severity: 'warning', platform: 'website', field: 'seoTitle', message: 'SEO title is very short.' });
    if (web.metaDescription.length > settings.seo.metaMaxLength) issues.push({ severity: 'error', platform: 'website', field: 'metaDescription', message: `Meta description is ${web.metaDescription.length} characters; keep it at or under ${settings.seo.metaMaxLength}.` });
    if (web.metaDescription.length < 70) issues.push({ severity: 'warning', platform: 'website', field: 'metaDescription', message: 'Meta description is shorter than 70 characters.' });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(web.slug)) issues.push({ severity: 'error', platform: 'website', field: 'slug', message: 'Slug must be lowercase letters, numbers and hyphens.' });
    const text = stripHtml(web.articleHtml);
    const density = keywordDensityPercent(text, web.primaryKeyword);
    if (density > 3) issues.push({ severity: 'error', platform: 'website', field: 'articleHtml', message: `Primary keyword density is ${density.toFixed(1)}%, which reads as keyword stuffing.` });
    else if (density > 2) issues.push({ severity: 'warning', platform: 'website', field: 'articleHtml', message: `Primary keyword density is ${density.toFixed(1)}%; consider reducing repetition.` });
    if (wordCount(text) < 300) issues.push({ severity: 'warning', platform: 'website', field: 'articleHtml', message: 'Article is under 300 words.' });
    if (/<h1[\s>]/i.test(web.articleHtml)) issues.push({ severity: 'warning', platform: 'website', field: 'articleHtml', message: 'Article body contains an <h1>; the page title already renders as H1.' });
    if (/<script/i.test(web.articleHtml)) issues.push({ severity: 'error', platform: 'website', field: 'articleHtml', message: 'Article contains a <script> tag.' });
  }
  return issues;
}
