export const COLLECTIONS = {
  users: 'users',
  brands: 'brands',
  videos: 'videos',
  videoAnalysis: 'videoAnalysis',
  seoAnalyses: 'seoAnalyses',
  content: 'content',
  contentVersions: 'contentVersions',
  connectedAccounts: 'connectedAccounts',
  accountSecrets: 'accountSecrets',
  scheduledPosts: 'scheduledPosts',
  publishedPosts: 'publishedPosts',
  publishingJobs: 'publishingJobs',
  analytics: 'analytics',
  settings: 'settings',
  activityLogs: 'activityLogs',
} as const;

export const PLATFORMS = ['instagram', 'facebook', 'website'] as const;

export const PLATFORM_LABELS: Record<(typeof PLATFORMS)[number], string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  website: 'Website',
};

export const CONTENT_STATUSES = [
  'draft', 'analyzing', 'generating', 'ready', 'scheduled',
  'publishing', 'published', 'failed', 'cancelled',
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-msvideo',
] as const;

export const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'avi'] as const;

export const DEFAULT_MAX_UPLOAD_MB = 100;
export const MAX_RETRY_COUNT = 5;
