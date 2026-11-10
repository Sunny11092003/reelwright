import type { UserSettings } from '../../shared/types';
import { AppError } from '../../utils/errors';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import type { AIProvider } from './types';

export type { AIProvider } from './types';

export function createProvider(name: string, model?: string): AIProvider {
  switch (name) {
    case 'gemini':
      return new GeminiProvider(model || undefined);
    case 'anthropic':
      return new AnthropicProvider(model || undefined);
    default:
      throw new AppError('CONFIG_MISSING', `Unknown AI provider "${name}"`, 400);
  }
}

export function getTextProvider(s: UserSettings): AIProvider {
  return createProvider(s.aiProvider, s.aiModel);
}

export function getVideoProvider(s: UserSettings): AIProvider {
  const p = createProvider(s.videoProvider);
  if (!p.supportsVideo) throw new AppError('AI_UNSUPPORTED', `${p.name} cannot analyze video`, 400);
  return p;
}
