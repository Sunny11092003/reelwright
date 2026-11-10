// Generates importable n8n workflow JSON files into n8n/workflows. Run: node scripts/generate-n8n-workflows.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'n8n', 'workflows');
mkdirSync(out, { recursive: true });

const BACKEND = '{{ $env.ACA_BACKEND_URL }}';
const id = () => randomUUID();
const hdr = (name, value) => ({ parameters: [{ name, value }] });

const webhookNode = (name, path, pos) => ({
  id: id(), name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos, webhookId: id(),
  parameters: { httpMethod: 'POST', path, responseMode: 'responseNode', options: {} },
});
const secretCheck = (pos) => ({
  id: id(), name: 'Valid secret?', type: 'n8n-nodes-base.if', typeVersion: 2, position: pos,
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and',
    conditions: [{ id: id(), leftValue: "={{ $json.headers['x-aca-secret'] }}", rightValue: '={{ $env.ACA_WEBHOOK_SECRET }}', operator: { type: 'string', operation: 'equals' } }] }, options: {} },
});
const respond = (name, code, body, pos) => ({
  id: id(), name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos,
  parameters: { respondWith: 'json', responseBody: `={{ ${JSON.stringify(body)} }}`, options: { responseCode: code } },
});
const runStage = (name, stage, bodyExpr, pos) => ({
  id: id(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueErrorOutput',
  parameters: { method: 'POST', url: `=${BACKEND}/api/internal/stages/${stage}/run`, sendHeaders: true, headerParameters: hdr('x-internal-secret', '={{ $env.ACA_INTERNAL_SECRET }}'),
    sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify(${bodyExpr}) }}`, options: { timeout: 900000 } },
});
const callback = (name, event, stage, srcExpr, pos, withError) => ({
  id: id(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
  parameters: { method: 'POST', url: `=${BACKEND}/api/webhooks/n8n`, sendHeaders: true, headerParameters: hdr('x-aca-secret', '={{ $env.ACA_WEBHOOK_SECRET }}'),
    sendBody: true, specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ event: '${event}', stage: '${stage}', userId: ${srcExpr}.userId, resourceId: ${srcExpr}.resourceId, requestId: ${srcExpr}.requestId || 'n8n'${withError ? ", error: { code: 'N8N_STEP_FAILED', message: String($json.error && $json.error.message || $json.message || 'Workflow step failed').slice(0, 900) }" : ''} }) }}`, options: { timeout: 20000 } },
});

const conn = (from, outputs) => ({ [from]: { main: outputs.map((o) => o.map((to) => ({ node: to, type: 'main', index: 0 }))) } });
const merge = (...cs) => Object.assign({}, ...cs);

function stageWorkflow(file, name, path, stage) {
  const src = "$('Webhook').item.json.body";
  const nodes = [
    webhookNode('Webhook', path, [0, 200]), secretCheck([240, 200]),
    respond('Reject', 401, { error: 'invalid secret' }, [480, 360]), respond('Accept', 202, { accepted: true }, [480, 120]),
    runStage('Run stage on backend', stage, `{ userId: ${src}.userId, resourceId: ${src}.resourceId, requestId: ${src}.requestId }`, [720, 120]),
    callback('Report completed', 'stage.completed', stage, src, [980, 40], false),
    callback('Report failed', 'stage.failed', stage, src, [980, 220], true),
  ];
  const connections = merge(
    conn('Webhook', [['Valid secret?']]), conn('Valid secret?', [['Accept'], ['Reject']]), conn('Accept', [['Run stage on backend']]),
    conn('Run stage on backend', [['Report completed'], ['Report failed']]),
  );
  write(file, name, nodes, connections);
}

function write(file, name, nodes, connections) {
  writeFileSync(resolve(out, file), JSON.stringify({ name, nodes, connections, active: false, settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataErrorExecution: 'all', saveDataSuccessExecution: 'none' }, pinData: {}, tags: [], meta: { templateCredsSetupCompleted: true } }, null, 2) + '\n');
  console.log('wrote', file);
}

stageWorkflow('video-analysis.json', 'ACA - Video analysis', 'aca/video-analysis', 'video-analysis');
stageWorkflow('seo-generation.json', 'ACA - SEO generation', 'aca/seo-generation', 'seo-analysis');
stageWorkflow('content-generation.json', 'ACA - Content generation', 'aca/content-generation', 'content-generation');
stageWorkflow('publishing.json', 'ACA - Publishing', 'aca/publishing', 'publishing');

// Scheduling: every minute claim due posts, then publish each.
{
  const nodes = [
    { id: id(), name: 'Every minute', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 200], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } },
    { id: id(), name: 'Claim due posts', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [240, 200], retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
      parameters: { method: 'POST', url: `=${BACKEND}/api/internal/scheduler/claim`, sendHeaders: true, headerParameters: hdr('x-internal-secret', '={{ $env.ACA_INTERNAL_SECRET }}'), options: { timeout: 60000 } } },
    { id: id(), name: 'Split jobs', type: 'n8n-nodes-base.splitOut', typeVersion: 1, position: [480, 200], parameters: { fieldToSplitOut: 'jobs', options: {} } },
    runStage('Publish scheduled job', 'publishing', "{ userId: $json.userId, resourceId: $json.jobId, requestId: 'scheduled-' + $json.jobId }", [720, 200]),
    callback('Report failed', 'stage.failed', 'publishing', "{ userId: $('Split jobs').item.json.userId, resourceId: $('Split jobs').item.json.jobId, requestId: 'scheduled' }".replace(/^\{/, '(').replace(/\}$/, ')'), [980, 280], true),
  ];
  // simpler explicit callback expression for the failure branch
  nodes[4].parameters.jsonBody = "={{ JSON.stringify({ event: 'stage.failed', stage: 'publishing', userId: $('Split jobs').item.json.userId, resourceId: $('Split jobs').item.json.jobId, requestId: 'scheduled', error: { code: 'N8N_STEP_FAILED', message: String($json.error && $json.error.message || 'Workflow step failed').slice(0, 900) } }) }}";
  write('scheduling.json', 'ACA - Scheduling', nodes, merge(conn('Every minute', [['Claim due posts']]), conn('Claim due posts', [['Split jobs']]), conn('Split jobs', [['Publish scheduled job']]), conn('Publish scheduled job', [[], ['Report failed']])));
}

// Analytics: webhook for one user, plus a 6-hourly sync for everyone.
{
  const src = "$('Webhook').item.json.body";
  const nodes = [
    webhookNode('Webhook', 'aca/analytics', [0, 120]), secretCheck([240, 120]), respond('Reject', 401, { error: 'invalid secret' }, [480, 280]), respond('Accept', 202, { accepted: true }, [480, 40]),
    runStage('Sync user metrics', 'analytics-sync', `{ userId: ${src}.userId, resourceId: ${src}.resourceId, requestId: ${src}.requestId }`, [720, 40]),
    { id: id(), name: 'Every 6 hours', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 460], parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 6 }] } } },
    { id: id(), name: 'Sync all users', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [240, 460], retryOnFail: true, maxTries: 2, waitBetweenTries: 30000,
      parameters: { method: 'POST', url: `=${BACKEND}/api/internal/analytics/sync-all`, sendHeaders: true, headerParameters: hdr('x-internal-secret', '={{ $env.ACA_INTERNAL_SECRET }}'), options: { timeout: 900000 } } },
  ];
  write('analytics.json', 'ACA - Analytics', nodes, merge(conn('Webhook', [['Valid secret?']]), conn('Valid secret?', [['Accept'], ['Reject']]), conn('Accept', [['Sync user metrics']]), conn('Every 6 hours', [['Sync all users']])));
}

// Error handling: attach as the "Error workflow" in each ACA workflow's settings.
{
  const nodes = [
    { id: id(), name: 'Error Trigger', type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 120], parameters: {} },
    { id: id(), name: 'Report error to backend', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [260, 120], retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
      parameters: { method: 'POST', url: `=${BACKEND}/api/internal/n8n-error`, sendHeaders: true, headerParameters: hdr('x-internal-secret', '={{ $env.ACA_INTERNAL_SECRET }}'),
        sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ workflow: $json.workflow && $json.workflow.name, executionId: $json.execution && $json.execution.id, node: $json.execution && $json.execution.lastNodeExecuted, message: $json.execution && $json.execution.error && $json.execution.error.message }) }}", options: { timeout: 15000 } } },
  ];
  write('error-handler.json', 'ACA - Error handler', nodes, conn('Error Trigger', [['Report error to backend']]));
}
