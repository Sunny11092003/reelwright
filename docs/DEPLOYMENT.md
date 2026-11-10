# Production deployment

## Topology
- **Frontend**: static build (`npm --prefix frontend run build`) on Firebase Hosting, Netlify, Vercel or the nginx image. Set `VITE_*` at build time; `VITE_API_BASE_URL` is the backend URL.
- **Backend**: container (`backend/Dockerfile`, build context = repo root) on Cloud Run, Fly.io, Render, Railway or a VM, behind https.
- **n8n**: self-hosted container with a persistent volume, reachable from the backend, able to reach the backend at `ACA_BACKEND_URL`.
- **Firebase**: Auth + Firestore.

## Checklist
1. `NODE_ENV=production`; `FRONTEND_URL` and `BACKEND_PUBLIC_URL` use https.
2. Secrets from `.env.example` live in your platform's secret manager, not in images.
3. Meta app: add the production redirect URI `https://<backend>/api/accounts/callback/meta`; complete App Review for multi-user use (META_SETUP.md).
4. Firebase Auth → Authorized domains includes the frontend domain.
5. `firebase deploy --only firestore` (rules + indexes).
6. n8n: import and activate workflows, set `ACA_*` env vars, protect the n8n UI. Set execution mode to n8n in Settings.
7. Several backend instances are safe (scheduled-post claiming is transactional). Enable `RUN_INTERNAL_SCHEDULER` on at most one, or rely on the n8n scheduling workflow.
8. Cloud Run: request timeout ≥ 15 min; if you use `direct` mode keep CPU always allocated so background stages finish, and min instances ≥ 1 for the internal scheduler.
9. Logs are structured JSON (`timestamp, level, service, requestId, userId`); secrets are redacted.

## Backups
Enable Firestore scheduled backups/PITR. Back up the n8n volume and `N8N_ENCRYPTION_KEY`.
