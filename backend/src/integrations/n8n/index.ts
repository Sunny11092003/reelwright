import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { fetchWithTimeout } from '../../utils/http';
import { createLogger } from '../../utils/logger';

const log = createLogger('n8n');

export type Stage = 'video-analysis' | 'seo-analysis' | 'content-generation' | 'publishing' | 'analytics-sync';

export interface StagePayload {
  stage: Stage;
  userId: string;
  resourceId: string;
  requestId: string;
}

const WORKFLOW_PATH: Record<Stage, string> = {
  'video-analysis': 'video-analysis',
  'seo-analysis': 'seo-generation',
  'content-generation': 'content-generation',
  publishing: 'publishing',
  'analytics-sync': 'analytics',
};

export function n8nConfigured(): boolean {
  return Boolean(env.N8N_BASE_URL && env.N8N_WEBHOOK_SECRET);
}

export async function triggerWorkflow(payload: StagePayload): Promise<void> {
  if (!env.N8N_BASE_URL || !env.N8N_WEBHOOK_SECRET) {
    throw new AppError('CONFIG_MISSING', 'n8n is not configured. Set N8N_BASE_URL and N8N_WEBHOOK_SECRET, or switch execution mode to "direct" in Settings.', 503);
  }
  const url = `${env.N8N_BASE_URL.replace(/\/$/, '')}${env.N8N_WEBHOOK_PATH_PREFIX}/${WORKFLOW_PATH[payload.stage]}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-aca-secret': env.N8N_WEBHOOK_SECRET, 'x-request-id': payload.requestId },
      body: JSON.stringify(payload),
      timeoutMs: 10_000,
    });
  } catch (e) {
    log.error('n8n unreachable', e);
    throw new AppError('N8N_UNAVAILABLE', 'n8n is unreachable. Check that it is running and N8N_BASE_URL is correct.', 503, undefined, true);
  }
  if (res.status === 404) {
    throw new AppError('N8N_REJECTED', `The n8n workflow "${WORKFLOW_PATH[payload.stage]}" is not active or not imported. See docs/N8N_SETUP.md.`, 502);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AppError('N8N_REJECTED', 'n8n rejected the webhook secret. Make sure ACA_WEBHOOK_SECRET in n8n equals N8N_WEBHOOK_SECRET.', 502);
  }
  if (!res.ok) {
    throw new AppError('N8N_REJECTED', `n8n returned HTTP ${res.status} when starting the workflow`, 502, undefined, res.status >= 500);
  }
}

export async function n8nHealth(): Promise<{ reachable: boolean; detail: string }> {
  if (!env.N8N_BASE_URL) return { reachable: false, detail: 'N8N_BASE_URL is not set' };
  try {
    const res = await fetchWithTimeout(`${env.N8N_BASE_URL.replace(/\/$/, '')}/healthz`, { timeoutMs: 5000 });
    return { reachable: res.ok, detail: res.ok ? 'n8n responded to /healthz' : `n8n responded with HTTP ${res.status}` };
  } catch {
    return { reachable: false, detail: 'n8n did not respond' };
  }
}
