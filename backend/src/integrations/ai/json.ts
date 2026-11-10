import type { ZodType, ZodTypeDef } from 'zod';
import { AppError } from '../../utils/errors';
import type { AIProvider, JsonRequest } from './types';

export function parseModelJson(text: string): unknown {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1) throw new AppError('AI_INVALID_OUTPUT', 'The AI response did not contain JSON', 502);
  try {
    return JSON.parse(t.slice(first, last + 1));
  } catch {
    throw new AppError('AI_INVALID_OUTPUT', 'The AI response contained malformed JSON', 502, undefined, true);
  }
}

/** Calls the provider and validates against a zod schema; one corrective retry on invalid output. */
export async function generateStructured<T>(provider: AIProvider, schema: ZodType<T, ZodTypeDef, unknown>, req: JsonRequest): Promise<T> {
  let raw = await provider.generateJson(req);
  let parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  raw = await provider.generateJson({
    ...req,
    prompt: `${req.prompt}\n\nYour previous answer failed validation (${issues}). Return corrected JSON that satisfies the required shape exactly.`,
  });
  parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('AI_INVALID_OUTPUT', 'The AI returned content in an unexpected format', 502, parsed.error.issues.slice(0, 8));
  }
  return parsed.data;
}
