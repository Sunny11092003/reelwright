import type { ConnectedAccount, Platform, PlatformContent, PostMetrics, PublishOptions, VideoDoc } from '../shared/types';
import type { Logger } from '../utils/logger';

export interface AccountWithSecret {
  account: ConnectedAccount;
  secret: Record<string, string>;
}

export interface PublishContext {
  account: AccountWithSecret;
  video: VideoDoc;
  content: PlatformContent;
  title: string;
  options: PublishOptions;
  settings: import('../shared/types').UserSettings;
  log: Logger;
  progress: (message: string) => Promise<void>;
}

export interface PublishResult {
  externalId: string;
  url?: string;
}

/** Implement this interface to add a platform (YouTube, LinkedIn, TikTok, X, Pinterest ...). */
export interface SocialPublisher {
  readonly platform: Platform;
  validate(content: PlatformContent, video: VideoDoc): void;
  publish(ctx: PublishContext): Promise<PublishResult>;
  testConnection(account: AccountWithSecret): Promise<{ ok: boolean; detail: string }>;
  fetchMetrics?(account: AccountWithSecret, externalId: string, url?: string, publishedAt?: string): Promise<{ metrics: PostMetrics; note?: string }>;
}
