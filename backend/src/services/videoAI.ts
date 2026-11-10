import type { ZodType, ZodTypeDef } from 'zod';
import type { AIProvider, VideoRequest } from '../integrations/ai/types';
import { AppError } from '../utils/errors';

/** Video analysis with schema validation and one retry (analysis is expensive, so only retry on invalid output). */
export async function generateStructuredVideo<T>(provider: AIProvider, schema: ZodType<T, ZodTypeDef, unknown>, req: VideoRequest): Promise<T> {
  const raw = await provider.analyzeVideo(req);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const raw2 = await provider.analyzeVideo({ ...req, prompt: `${req.prompt}\n\nReturn every required key. Previous output was invalid: ${parsed.error.issues.slice(0, 5).map((i) => i.path.join('.')).join(', ')}` });
  const parsed2 = schema.safeParse(raw2);
  if (!parsed2.success) throw new AppError('AI_INVALID_OUTPUT', 'The AI returned video analysis in an unexpected format', 502, parsed2.error.issues.slice(0, 8));
  return parsed2.data;
}
