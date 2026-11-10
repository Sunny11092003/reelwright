import type { Platform } from '../shared/types';
import { AppError } from '../utils/errors';
import { facebookPublisher } from './facebook';
import { instagramPublisher } from './instagram';
import type { SocialPublisher } from './types';
import { websitePublisher } from './website';

const registry = new Map<Platform, SocialPublisher>();
[instagramPublisher, facebookPublisher, websitePublisher].forEach((p) => registry.set(p.platform, p));

export function getPublisher(platform: Platform): SocialPublisher {
  const p = registry.get(platform);
  if (!p) throw new AppError('PLATFORM_REQUIREMENT', `Publishing to ${platform} is not supported`, 400);
  return p;
}
