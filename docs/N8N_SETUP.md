# n8n setup

## Role of n8n
The frontend only talks to the backend. For each long-running stage the backend calls an n8n webhook; n8n checks the shared secret, answers `202`, calls the backend's internal API to run the stage, then reports success or failure to `POST /api/webhooks/n8n`. n8n holds **no** AI, Meta, WordPress or Cloudinary credentials, only two shared secrets.

```
Backend --x-aca-secret--> n8n webhook --x-internal-secret--> Backend /api/internal/stages/:stage/run
                                       \--x-aca-secret--> Backend /api/webhooks/n8n (completed | failed)
```

## Start n8n
Docker: set `N8N_ENCRYPTION_KEY`, `INTERNAL_API_SECRET`, `N8N_WEBHOOK_SECRET` in the root `.env`, then `docker compose up -d n8n backend`. Open http://localhost:5678 and create the owner account.

Without Docker run `npx n8n` after exporting:
```bash
export N8N_BLOCK_ENV_ACCESS_IN_NODE=false
export ACA_BACKEND_URL=http://localhost:4000
export ACA_INTERNAL_SECRET=<same as backend INTERNAL_API_SECRET>
export ACA_WEBHOOK_SECRET=<same as backend N8N_WEBHOOK_SECRET>
```

## Import workflows
Workflows → Import from file, once per file in `n8n/workflows/`: `video-analysis`, `seo-generation`, `content-generation`, `publishing`, `scheduling`, `analytics`, `error-handler`. **Activate** each one. Production webhook URLs are `http://<n8n>/webhook/aca/<name>`.
Optionally set `ACA - Error handler` as the Error workflow in each workflow's settings.

## Point the backend at n8n
Backend `.env`: `N8N_BASE_URL` (`http://n8n:5678` in compose), `N8N_WEBHOOK_SECRET`, `INTERNAL_API_SECRET`. Then Settings → System and Execution mode → **n8n workflows**. The status panel shows whether n8n answers `/healthz`.

If you use the n8n scheduling workflow set `RUN_INTERNAL_SCHEDULER=false` (both together is safe because claiming is transactional, just redundant).

## Regenerate / validate
`node scripts/generate-n8n-workflows.mjs` rewrites the JSON; `npm run validate:n8n` checks structure.

## Troubleshooting
| Symptom | Cause |
|---|---|
| `N8N_REJECTED ... not active or not imported` | Workflow not activated (webhook returned 404). |
| `N8N_REJECTED ... rejected the webhook secret` | `ACA_WEBHOOK_SECRET` in n8n differs from `N8N_WEBHOOK_SECRET`. |
| `$env` access denied in an expression | `N8N_BLOCK_ENV_ACCESS_IN_NODE` must be `false`. |
| Stage run returns 401 | `ACA_INTERNAL_SECRET` differs from `INTERNAL_API_SECRET`. |
| `N8N_UNAVAILABLE` | n8n not running, or `N8N_BASE_URL` unreachable from the backend. |
