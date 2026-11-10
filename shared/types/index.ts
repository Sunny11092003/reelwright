/** Canonical shared types. Copied into backend/src/shared and frontend/src/shared by `npm run sync:shared`. */
export type Platform = 'instagram' | 'facebook' | 'website';
export type ContentStatus =
  | 'draft' | 'analyzing' | 'generating' | 'ready' | 'scheduled'
  | 'publishing' | 'published' | 'failed' | 'cancelled';
export type JobStatus = 'queued' | 'publishing' | 'published' | 'failed' | 'cancelled';
export type VideoStatus = 'uploaded' | 'analyzing' | 'analyzed' | 'failed';
export type ISODate = string;

export interface User {
  id: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  createdAt: ISODate;
  lastLoginAt: ISODate;
}

export interface Brand {
  id: string;
  userId: string;
  name: string;
  description: string;
  website: string;
  industry: string;
  country: string;
  city: string;
  targetAudience: string;
  tone: string;
  keywords: string[];
  forbiddenWords: string[];
  preferredCta: string;
  socialHandles: { instagram?: string; facebook?: string; x?: string; linkedin?: string; youtube?: string };
  logoUrl?: string;
  colors: string[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface JobErrorInfo {
  errorCode: string;
  errorMessage: string;
  platform?: Platform | 'system';
  timestamp: ISODate;
  requestId: string;
  retryCount: number;
}

export interface VideoDoc {
  id: string;
  userId: string;
  brandId: string | null;
  filename: string;
  cloudinaryPublicId: string;
  url: string;
  thumbnailUrl: string;
  format: string;
  mimeType: string;
  bytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  status: VideoStatus;
  analysisId?: string;
  error?: JobErrorInfo;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface VideoScene {
  startSeconds: number;
  endSeconds: number;
  description: string;
  onScreenText?: string;
}

export interface VideoAnalysis {
  id: string;
  userId: string;
  videoId: string;
  titleSuggestion: string;
  topic: string;
  summary: string;
  transcript: string;
  language: string;
  keywords: string[];
  entities: { name: string; type: string }[];
  audience: string;
  location: string;
  intent: string;
  brandMentions: string[];
  callToAction: string;
  scenes: VideoScene[];
  objects: string[];
  people: string[];
  actions: string[];
  onScreenText: string[];
  importantMoments: { atSeconds: number; description: string }[];
  provider: string;
  model: string;
  createdAt: ISODate;
}

export interface SEOContext {
  brandId: string | null;
  brand: string;
  country: string;
  city: string;
  audience: string;
  industry: string;
  language: string;
  goal: string;
}

export interface SEOAnalysis {
  id: string;
  userId: string;
  videoId: string;
  brandId: string | null;
  context: SEOContext;
  primaryKeyword: string;
  secondaryKeywords: string[];
  longTailKeywords: string[];
  searchIntent: 'informational' | 'navigational' | 'commercial' | 'transactional' | 'local';
  relatedQueries: string[];
  contentAngle: string;
  locationKeywords: string[];
  questionKeywords: string[];
  semanticKeywords: string[];
  hashtags: string[];
  status: 'pending' | 'ready' | 'failed';
  error?: JobErrorInfo;
  provider: string;
  model: string;
  createdAt: ISODate;
  updatedAt?: ISODate;
}

export interface InstagramContent {
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  keywords: string[];
  altText: string;
  coverText: string;
  shortCaption: string;
  longCaption: string;
}

export interface FacebookContent {
  title: string;
  description: string;
  caption: string;
  cta: string;
  hashtags: string[];
}

export interface WebsiteContent {
  seoTitle: string;
  metaDescription: string;
  h1: string;
  slug: string;
  shortDescription: string;
  articleHtml: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  faq: { question: string; answer: string }[];
  imageAltText: string;
  internalLinks: { anchor: string; suggestion: string }[];
  externalReferences: { title: string; note: string }[];
  schemaJsonLd: Record<string, unknown>;
  categories: string[];
  tags: string[];
}

export interface PlatformContent {
  instagram?: InstagramContent;
  facebook?: FacebookContent;
  website?: WebsiteContent;
}

export interface QualityIssue {
  severity: 'error' | 'warning';
  platform: Platform | 'all';
  field?: string;
  message: string;
}

export interface QualityReport {
  passed: boolean;
  score: number;
  issues: QualityIssue[];
  attempts: number;
  checkedAt: ISODate;
}

export interface GeneratedContent {
  id: string;
  userId: string;
  videoId: string;
  brandId: string | null;
  analysisId: string;
  seoId: string;
  title: string;
  status: ContentStatus;
  platforms: Platform[];
  content: PlatformContent;
  version: number;
  quality: QualityReport | null;
  needsReview: boolean;
  thumbnailUrl: string;
  error?: JobErrorInfo;
  createdAt: ISODate;
  updatedAt: ISODate;
  publishedAt?: ISODate;
}

export interface ContentVersion {
  id: string;
  userId: string;
  contentId: string;
  version: number;
  content: PlatformContent;
  reason: 'generated' | 'edited' | 'regenerated' | 'restored';
  instruction?: string;
  createdAt: ISODate;
}

export interface ConnectedAccount {
  id: string;
  userId: string;
  provider: 'meta' | 'wordpress';
  platform: Platform;
  externalId: string;
  name: string;
  username?: string;
  linkedPageId?: string;
  siteUrl?: string;
  status: 'connected' | 'expired' | 'error';
  lastCheckedAt?: ISODate;
  lastError?: string;
  scopes?: string[];
  connectedAt: ISODate;
  updatedAt: ISODate;
}

export interface PublishOptions {
  wordpressStatus?: 'publish' | 'draft';
}

export interface PublishingJob {
  id: string;
  userId: string;
  contentId: string;
  videoId: string;
  platform: Platform;
  accountId: string;
  status: JobStatus;
  options: PublishOptions;
  retryCount: number;
  requestId: string;
  scheduledPostId?: string;
  externalId?: string;
  publishedUrl?: string;
  progress?: string;
  error?: JobErrorInfo;
  createdAt: ISODate;
  updatedAt: ISODate;
  startedAt?: ISODate;
  completedAt?: ISODate;
}

export interface ScheduledPost {
  id: string;
  userId: string;
  contentId: string;
  platform: Platform;
  accountId: string;
  scheduledAt: ISODate;
  timezone: string;
  status: 'scheduled' | 'processing' | 'published' | 'failed' | 'cancelled';
  options: PublishOptions;
  jobId?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface PublishedPost {
  id: string;
  userId: string;
  contentId: string;
  videoId: string;
  platform: Platform;
  accountId: string;
  jobId: string;
  externalId: string;
  url?: string;
  publishedAt: ISODate;
  lastMetricsAt?: ISODate;
}

export interface PostMetrics {
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reactions?: number;
}

export interface AnalyticsSnapshot {
  id: string;
  userId: string;
  publishedPostId: string;
  contentId: string;
  platform: Platform;
  metrics: PostMetrics;
  note?: string;
  collectedAt: ISODate;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action:
    | 'video.uploaded' | 'video.analyzed' | 'seo.generated' | 'content.generated'
    | 'content.edited' | 'content.regenerated' | 'content.restored' | 'content.deleted'
    | 'content.duplicated' | 'account.connected' | 'account.disconnected'
    | 'post.published' | 'post.scheduled' | 'post.failed' | 'post.retried'
    | 'post.cancelled' | 'brand.saved' | 'settings.saved';
  entityType: string;
  entityId: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: ISODate;
}

export interface UserSettings {
  userId: string;
  aiProvider: 'gemini' | 'anthropic';
  aiModel: string;
  videoProvider: 'gemini';
  defaultLanguage: string;
  defaultCountry: string;
  defaultTimezone: string;
  defaultBrandId: string | null;
  executionMode: 'n8n' | 'direct';
  seo: { titleMaxLength: number; metaMaxLength: number; maxInstagramHashtags: number; goal: string };
  publishing: { defaultPlatforms: Platform[]; wordpressStatus: 'publish' | 'draft' };
  wordpress: { seoPlugin: 'yoast' | 'rankmath' | 'none'; includeSchema: boolean; embedVideo: boolean };
  updatedAt: ISODate;
}

export interface AnalyticsSummary {
  totals: Record<Platform, PostMetrics & { posts: number }>;
  series: { date: string; instagram: number; facebook: number; website: number }[];
  posts: {
    publishedPostId: string; contentId: string; title: string; platform: Platform; url?: string;
    publishedAt: string; metrics: PostMetrics | null; collectedAt?: string; note?: string;
  }[];
  insights: { generatedAt: string; items: string[]; basedOnPosts: number } | null;
  websiteAnalyticsConfigured: boolean;
}

export interface DashboardData {
  counts: {
    videosProcessed: number; contentGenerated: number; postsPublished: number;
    scheduledPosts: number; failedPosts: number;
  };
  accounts: ConnectedAccount[];
  recentContent: GeneratedContent[];
  recentActivity: ActivityLog[];
}
