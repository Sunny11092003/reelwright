# Setup guide

## 1. Requirements
Node.js 20+, npm 10+, a Firebase project, a Cloudinary account, a Google AI Studio (Gemini) API key. Optional: Docker, a Meta developer app (Instagram/Facebook), a WordPress site, n8n.

## 2. Install
```bash
cd ai-content-agent
npm run install:all
npm run sync:shared          # copies shared/ into backend and frontend (already done in this archive)
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
```

## 3. Firebase
1. console.firebase.google.com → Add project.
2. Build → Authentication → Get started → enable **Email/Password** and **Google**. Under Settings → Authorized domains add your production domain.
3. Build → Firestore Database → Create database (production mode). Choose a region near your users.
4. Project settings → General → Your apps → Web app → copy the config into `frontend/.env` (`VITE_FIREBASE_*`).
5. Project settings → Service accounts → Generate new private key. Put `project_id`, `client_email`, `private_key` into `backend/.env` as `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (keep the quotes and `\n`).
6. Deploy rules and indexes (required; several queries fail without the indexes):
```bash
npm i -g firebase-tools && firebase login
firebase use <project-id>
firebase deploy --only firestore
```
Rules let clients **read only their own documents**. All writes go through the backend. `accountSecrets` (encrypted tokens) is never readable by clients.

## 4. Cloudinary
Dashboard → copy Cloud name, API key, API secret into `backend/.env`. Uploads go from the browser straight to Cloudinary with a signature minted by the backend, so the API secret never reaches the browser. Free plans cap video uploads at 100 MB, the default `MAX_UPLOAD_MB`.

## 5. AI
Create a key at https://aistudio.google.com/apikey and set `GEMINI_API_KEY`. Video understanding (visuals, audio, transcript) uses Gemini via the Files API. Text stages can use Gemini or Anthropic (`ANTHROPIC_API_KEY`; choose in Settings). To add a provider, implement `AIProvider` in `backend/src/integrations/ai` and register it in `index.ts`.

## 6. Secrets to generate
```bash
openssl rand -hex 32     # SESSION_SECRET
openssl rand -hex 32     # INTERNAL_API_SECRET
openssl rand -hex 32     # N8N_WEBHOOK_SECRET
openssl rand -base64 32  # TOKEN_ENCRYPTION_KEY (exactly 32 bytes)
openssl rand -hex 16     # N8N_ENCRYPTION_KEY (docker compose)
```
Changing `TOKEN_ENCRYPTION_KEY` later makes stored account credentials unreadable; users must reconnect.

## 7. Run locally
```bash
npm run dev:backend      # http://localhost:4000
npm run dev:frontend     # http://localhost:5173 (proxies /api to the backend)
```
Keep `DEFAULT_EXECUTION_MODE=direct` and `RUN_INTERNAL_SCHEDULER=true` to work without n8n. Switch to n8n in Settings → System once it is set up (N8N_SETUP.md).

## 8. End-to-end test
1. Sign up. Create a brand profile.
2. Create → pick the brand → upload a short MP4 (9:16, under 100 MB).
3. Analyze video; wait for the analysis card (transcript, scenes, keywords).
4. Review SEO context → Run SEO analysis → Generate content. The quality report shows on the editor.
5. Edit a field, Save, then use the sparkle icon to regenerate with an instruction; open Versions and restore the earlier one.
6. Accounts → connect WordPress (simplest) → Publish → "Save as draft" → confirm → check the Publishing page and your WordPress drafts.
7. Connect Meta, publish to Instagram/Facebook, then Analytics → Collect latest metrics.
8. Schedule a post two minutes ahead and watch Scheduled posts.
