import { env, requireEnv } from '../../config/env';
import { AppError } from '../../utils/errors';
import { fetchWithTimeout, readJson, withRetry } from '../../utils/http';
import { parseModelJson } from './json';
import type { AIProvider, JsonRequest, VideoRequest } from './types';

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  error?: { type: string; message: string };
}

/** Text-only provider. Video analysis must use a video-capable provider (Gemini). */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly supportsVideo = false;
  constructor(readonly model: string = env.ANTHROPIC_MODEL) {}

  async generateJson(req: JsonRequest): Promise<unknown> {
    const key = requireEnv('ANTHROPIC_API_KEY', 'the Anthropic AI provider');
    return withRetry(async () => {
      const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxOutputTokens ?? 8192,
          temperature: req.temperature ?? 0.7,
          system: `${req.system}\n\nRespond with a single JSON object only. No prose, no markdown fences.`,
          messages: [{ role: 'user', content: req.prompt }],
        }),
        timeoutMs: 180_000,
      });
      const body = await readJson<AnthropicResponse>(res);
      if (!res.ok) {
        const msg = body.error?.message ?? `Anthropic request failed (HTTP ${res.status})`;
        if (res.status === 429) throw new AppError('RATE_LIMITED', msg, 429, undefined, true);
        if (res.status >= 500 || res.status === 529) throw new AppError('AI_FAILURE', msg, 502, undefined, true);
        throw new AppError('AI_FAILURE', msg, 502);
      }
      const text = (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
      if (!text) throw new AppError('AI_FAILURE', 'Anthropic returned an empty response', 502, undefined, true);
      return parseModelJson(text);
    });
  }

  analyzeVideo(_req: VideoRequest): Promise<unknown> {
    throw new AppError('AI_UNSUPPORTED', 'The selected provider cannot analyze video. Choose Gemini for video analysis in Settings.', 400);
  }
}
