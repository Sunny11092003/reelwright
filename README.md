# Reelwright: AI Content & Social Publishing Agent

Upload a video once. The agent analyzes it (visuals + audio + transcript), runs SEO research, writes separate content for **Instagram, Facebook and your website**, lets you review and edit every field, then publishes or schedules through the official Meta Graph API and WordPress REST API, and tracks results.

```
UPLOAD → AI ANALYSIS → SEO ANALYSIS → CONTENT GENERATION → QUALITY CHECK → REVIEW/EDIT → PUBLISH/SCHEDULE → TRACK
```

## 1. Overview
- React + Vite + TypeScript + Tailwind dashboard (Dashboard, Create, Library, Editor with versions, Publishing, Scheduled, Analytics, Accounts, Brands, Settings, Activity).
- Express + TypeScript backend. Firebase Auth and Firestore. Cloudinary storage. n8n orchestration. Gemini (video + text) and optional Anthropic (text) behind an `AIProvider` interface.
- Staged AI pipeline with separate prompts: video analysis → SEO → per-platform generation → quality check (rule-based + LLM fact check, auto-retry once, otherwise flagged for review).
- Content versioning with restore, multi-brand profiles, activity log, retries with stored error details.

## 2. Architecture
```
React (Firebase Auth, realtime Firestore reads) ─► Express API ─► Firestore
                                                       │
                                  n8n webhooks ◄───────┤ (secret-authenticated both ways)
                                                       ▼
                    Gemini / Anthropic · Cloudinary · Meta Graph API · WordPress REST · GA4
```
- The browser holds only the public Firebase web config. AI keys, Meta secrets, WordPress credentials, Cloudinary secret, Firebase Admin key and n8n secrets exist only on the backend (and the two shared secrets in n8n).
- Firestore security rules: clients read their own documents only; every write goes through the backend. OAuth tokens and WordPress credentials are AES-256-GCM encrypted in `accountSecrets`, which clients cannot read.
- Execution modes (Settings → System): `n8n` (stages run through your workflows) or `direct` (same code runs in-process; useful locally).
- Adding a platform: implement `SocialPublisher` (`backend/src/publishers/types.ts`) and register it in `publishers/index.ts`.

## 3. Requirements
Node 20+, npm 10+, Firebase project, Cloudinary account, Gemini API key. Optional: Docker, Meta developer app, WordPress site, n8n.

## 4. Installation
```bash
npm run install:all
cp .env.example backend/.env && cp frontend/.env.example frontend/.env
```

## 5. Environment variables
Everything is documented inline in `.env.example`. Frontend values are in `frontend/.env.example`. The backend refuses to start with an invalid configuration and prints which variables are missing.

## 6–8. Firebase, Cloudinary, AI setup
See `docs/SETUP.md` (sections 3–5). Deploy Firestore rules and indexes with `firebase deploy --only firestore`.

## 9–11. Meta, Instagram, Facebook
See `docs/META_SETUP.md`. Requires an Instagram Business/Creator account linked to a Facebook Page. In Development mode the app works for people with a role on the Meta app without App Review; other users need Meta App Review.

## 12. WordPress
See `docs/WORDPRESS_SETUP.md` (Application Passwords; optional Yoast/Rank Math meta snippet).

## 13–14. n8n install and workflow import
See `docs/N8N_SETUP.md` and `n8n/README.md`.

## 15. Local development
```bash
npm run dev:backend      # :4000
npm run dev:frontend     # :5173
# or: docker compose up --build   (backend + n8n)   /   docker compose --profile full up --build
```

## 16. Production deployment
`docs/DEPLOYMENT.md`.

## 17. Database
Collections: users, brands, videos, videoAnalysis, seoAnalyses, content, contentVersions, connectedAccounts, accountSecrets, scheduledPosts, publishedPosts, publishingJobs, analytics, settings, activityLogs. Every user-owned document has `userId`. Types: `shared/types/index.ts`. Rules: `firestore.rules`. Indexes: `firestore.indexes.json`.

## 18. Security
Firebase ID-token verification on every user route · zod validation on every endpoint · rate limiting (stricter for AI routes) · helmet + strict CORS · shared-secret auth for n8n webhooks and internal routes (timing-safe compare) · signed OAuth `state` · encrypted credentials at rest · SSRF guard for WordPress URLs · HTML sanitization of generated articles · structured logs with secret redaction · no passwords for social accounts are ever requested.

## 19. Troubleshooting
| Problem | Fix |
|---|---|
| Backend exits at start | Read the printed list of missing/invalid env vars. |
| Firestore `FAILED_PRECONDITION: index` | `firebase deploy --only firestore` and wait for indexes to build. |
| Login works but API returns 401 | Backend `FIREBASE_PROJECT_ID` must match the frontend's project. |
| Upload rejected by Cloudinary | File too large for your plan or format not allowed. |
| Analysis fails with `AI_FAILURE` | Check `GEMINI_API_KEY`, quota and model name. |
| Meta `META_API_ERROR` permission | App in Development mode and your user lacks a role, or missing permission/Page access. |
| Instagram "could not process the video" | Use H.264/AAC MP4, 9:16, 3 s–15 min. |
| WordPress 401/403 | See `docs/WORDPRESS_SETUP.md` step 5. |
| `N8N_*` errors | `docs/N8N_SETUP.md` troubleshooting table. |

## 20. API documentation
`docs/API.md`.

## Known limits (be aware)
- Meta only allows publishing for accounts of users who have a role on your app until the app passes App Review.
- Search keyword suggestions come from the AI model, not from a live keyword-volume database; no volumes are claimed.
- Website traffic analytics need the optional GA4 service account variables; otherwise only published-post counts are shown.
- Videos are held in memory while being sent to Gemini; keep `MAX_UPLOAD_MB` modest on small instances.
- No automated test suite is included; verification so far is type-checking, production builds, n8n JSON structure validation and a backend start-up smoke test.
