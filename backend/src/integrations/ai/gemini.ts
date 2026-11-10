import { env, requireEnv } from '../../config/env';
import { AppError } from '../../utils/errors';
import { fetchWithTimeout, readJson, sleep, withRetry } from '../../utils/http';
import { createLogger } from '../../utils/logger';
import { parseModelJson } from './json';
import type { AIProvider, JsonRequest, VideoRequest } from './types';

const BASE = 'https://generativelanguage.googleapis.com';
const log = createLogger('ai.gemini');

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code: number; message: string; status: string };
}

function mapError(status: number, body: GeminiResponse): AppError {
  const message = body.error?.message ?? `Gemini request failed (HTTP ${status})`;
  if (status === 429) return new AppError('RATE_LIMITED', `Gemini rate limit reached: ${message}`, 429, undefined, true);
  if (status === 401 || status === 403) return new AppError('AI_FAILURE', `Gemini rejected the API key or access: ${message}`, 502);
  if (status >= 500) return new AppError('AI_FAILURE', `Gemini is unavailable: ${message}`, 502, undefined, true);
  return new AppError('AI_FAILURE', message, 502);
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly supportsVideo = true;
  constructor(readonly model: string = env.GEMINI_MODEL) {}

  private get key(): string {
    return requireEnv('GEMINI_API_KEY', 'the Gemini AI provider');
  }

  private async generate(parts: unknown[], system: string, temperature: number, maxOutputTokens: number): Promise<unknown> {
    return withRetry(async () => {
      const res = await fetchWithTimeout(`${BASE}/v1beta/models/${this.model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens },
        }),
        timeoutMs: 180_000,
      });
      const body = await readJson<GeminiResponse>(res);
      if (!res.ok) throw mapError(res.status, body);
      if (body.promptFeedback?.blockReason) {
        throw new AppError('AI_FAILURE', `Gemini blocked the request (${body.promptFeedback.blockReason})`, 422);
      }
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new AppError('AI_FAILURE', 'Gemini returned an empty response', 502, undefined, true);
      return parseModelJson(text);
    }, { retries: 4, baseMs: 5000 });
  }

  generateJson(req: JsonRequest): Promise<unknown> {
    return this.generate([{ text: req.prompt }], req.system, req.temperature ?? 0.7, req.maxOutputTokens ?? 8192);
  }

  async analyzeVideo(req: VideoRequest): Promise<unknown> {
    const file = await this.uploadFile(req.videoUrl, req.mimeType, req.displayName);
    try {
      await this.waitUntilActive(file.name);
      return await this.generate(
        [{ fileData: { mimeType: req.mimeType, fileUri: file.uri } }, { text: req.prompt }],
        req.system,
        0.2,
        16384,
      );
    } finally {
      fetchWithTimeout(`${BASE}/v1beta/${file.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': this.key }, timeoutMs: 15_000 }).catch((e) =>
        log.warn('Failed to delete temporary Gemini file', { message: String(e) }),
      );
    }
  }

  private async uploadFile(url: string, mimeType: string, displayName: string): Promise<{ name: string; uri: string }> {
    const src = await fetchWithTimeout(url, { timeoutMs: 300_000 });
    if (!src.ok) throw new AppError('CLOUDINARY_FAILURE', `Could not download the video for analysis (HTTP ${src.status})`, 502, undefined, src.status >= 500);
    const bytes = Buffer.from(await src.arrayBuffer());

    const start = await fetchWithTimeout(`${BASE}/upload/v1beta/files`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': this.key,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(bytes.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
    });
    if (!start.ok) throw mapError(start.status, await readJson<GeminiResponse>(start));
    const uploadUrl = start.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new AppError('AI_FAILURE', 'Gemini did not return an upload URL', 502);

    const up = await fetchWithTimeout(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Length': String(bytes.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
      body: bytes,
      timeoutMs: 600_000,
    });
    const body = await readJson<GeminiResponse & { file?: { name: string; uri: string } }>(up);
    if (!up.ok || !body.file) throw mapError(up.status, body);
    return body.file;
  }

  private async waitUntilActive(name: string): Promise<void> {
    for (let i = 0; i < 90; i++) {
      const res = await fetchWithTimeout(`${BASE}/v1beta/${name}`, { headers: { 'x-goog-api-key': this.key }, timeoutMs: 20_000 });
      const body = await readJson<{ state?: string; error?: { message?: string } }>(res);
      if (!res.ok) throw mapError(res.status, body as GeminiResponse);
      if (body.state === 'ACTIVE') return;
      if (body.state === 'FAILED') throw new AppError('INVALID_VIDEO', `Gemini could not process this video: ${body.error?.message ?? 'unsupported or corrupt file'}`, 422);
      await sleep(4000);
    }
    throw new AppError('AI_FAILURE', 'Timed out while Gemini was processing the video', 504, undefined, true);
  }
}
