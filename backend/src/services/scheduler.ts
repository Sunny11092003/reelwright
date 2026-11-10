import { env } from '../config/env';
import { createLogger } from '../utils/logger';
import { claimDueScheduledPosts, recoverStaleJobs, runPublishJob } from './publishingService';

const log = createLogger('scheduler');
let running = false;

/** In-process scheduler used when n8n is not orchestrating scheduling. Claiming is transactional, so it is safe next to n8n. */
export function startScheduler(): void {
  if (!env.RUN_INTERNAL_SCHEDULER) {
    log.info('Internal scheduler disabled (RUN_INTERNAL_SCHEDULER=false). n8n scheduling workflow must be active.');
    return;
  }
  log.info('Internal scheduler started');
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await recoverStaleJobs();
      const claimed = await claimDueScheduledPosts();
      for (const c of claimed) await runPublishJob(c.userId, c.jobId, `sched-${c.jobId}`);
    } catch (e) {
      log.error('Scheduler tick failed', e);
    } finally {
      running = false;
    }
  }, 60_000).unref();
}
