# Reelwright — AI Content & Social Publishing Agent

Upload a video once. Reelwright analyzes it with AI, researches SEO, writes separate content for **Instagram, Facebook and your website**, lets you review and edit every field, then publishes or schedules it through the official Meta Graph API and WordPress REST API, and tracks the results.

```
UPLOAD → AI ANALYSIS → SEO ANALYSIS → CONTENT GENERATION → QUALITY CHECK → REVIEW / EDIT → PUBLISH / SCHEDULE → TRACK
```

> Built for schools, small businesses and agencies that publish video regularly and want one workflow instead of rewriting the same post for every platform.

---

## Features

- **One upload, many platforms** — Instagram Reels, Facebook Reels and a website article from a single video.
- **Staged AI pipeline** — video analysis (visuals, audio, transcript) → SEO research → per-platform writing → quality check (rule-based checks plus an AI fact check, with one automatic retry).
- **Full editing** — edit any field, regenerate a single field, a platform or everything, with version history and restore.
- **Publish now or schedule** — jobs run in the background with retries and stored error details.
- **Multi-brand profiles** — tone, keywords, forbidden words, call to action, logo and colors per brand.
- **Tracking** — publishing status, post links, activity log and analytics.
- **Secure by design** — social passwords are never requested; tokens are encrypted at rest.
- **Extensible** — add a new platform by implementing one `SocialPublisher` interface.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, TipTap, Recharts |
| Backend | Node.js, Express, TypeScript, Zod, Pino |
| Data & auth | Firebase Authentication, Cloud Firestore |
| Media | Cloudinary (signed direct browser upload) |
| AI | Google Gemini (video + text), optional Anthropic (text), behind an `AIProvider` interface |
| Publishing | Meta Graph API (Instagram, Facebook), WordPress REST API |
| Orchestration | n8n webhooks (optional) or built-in direct mode |

## Architecture

```
React (Firebase Auth, realtime Firestore reads) ─► Express API ─► Firestore
                                                       │
                                  n8n webhooks ◄───────┤  (secret-authenticated both ways)
                                                       ▼
                    Gemini / Anthropic · Cloudinary · Meta Graph API · WordPress REST · GA4
```

- The browser holds only the public Firebase web config. AI keys, Meta secrets, WordPress credentials, the Cloudinary secret and the Firebase Admin key live only on the backend.
- Firestore rules let a user read only their own documents. Every write goes through the backend.
- OAuth tokens and WordPress credentials are encrypted with AES-256-GCM in a collection that clients cannot read.
- Execution modes: `n8n` (stages run through your workflows) or `direct` (same code runs in-process, good for local development).

## Project structure

```
backend/      Express API, AI pipeline, publishers, scheduler
frontend/     React dashboard
shared/       Types and constants shared by both sides
n8n/          Importable workflows
docs/         Setup, Meta, WordPress, n8n, API and deployment guides
scripts/      Sync and validation helpers
firestore.rules · firestore.indexes.json · firebase.json · docker-compose.yml
```

## Requirements

- Node.js 20+ and npm 10+
- A Firebase project (Authentication + Firestore)
- A Cloudinary account
- A Gemini API key
- Optional: a Meta developer app, a WordPress site, n8n, Docker

## Quick start

```bash
git clone <your-repo-url>
cd ai-content-agent

npm run install:all
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
```

1. Fill in `backend/.env` and `frontend/.env`. Every variable is explained inline in the example files. The backend refuses to start with missing values and tells you which ones.
2. Deploy the database rules and indexes:
   ```bash
   firebase login
   firebase deploy --only firestore
   ```
3. Start both apps in separate terminals:
   ```bash
   npm run dev:backend     # http://localhost:4000
   npm run dev:frontend    # http://localhost:5173
   ```
4. Open http://localhost:5173, sign in, create a **Brand profile**, then upload a video from **Create**.

Docker alternative:

```bash
docker compose up --build                     # backend + n8n
docker compose --profile full up --build      # full stack
```

## Generating secrets

The backend needs random secrets (`SESSION_SECRET`, `INTERNAL_API_SECRET`, `N8N_WEBHOOK_SECRET`, `TOKEN_ENCRYPTION_KEY`). Generate each one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Connecting Facebook and Instagram

1. Switch the Instagram account to **Business or Creator** and link it to your Facebook Page.
2. Create an app at https://developers.facebook.com and add the use cases **Manage messaging & content on Instagram** and **Manage everything on your Page**.
3. Add these permissions: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `read_insights`, `business_management`.
4. Under **Facebook Login → Settings**, add the redirect URI `http://localhost:4000/api/accounts/callback/meta` (and `https://<your-backend>/api/accounts/callback/meta` in production).
5. Put the **App ID** and **App Secret** in `backend/.env` as `META_APP_ID` and `META_APP_SECRET`, then restart the backend.
6. In the dashboard open **Connected accounts → Connect Instagram & Facebook**, approve, and use **Test connection**.
7. **Go Live.** While the Meta app is in Development mode, Facebook posts are visible only to people with a role on the app. Add a privacy policy URL, app icon and category, then publish the app.

Details: `docs/META_SETUP.md`.

## Connecting a website

WordPress works through Application Passwords. See `docs/WORDPRESS_SETUP.md`.

## Deployment

- **Frontend:** Vercel (set the `VITE_*` variables, add the domain to Firebase Authorized domains).
- **Backend:** an always-on Node host such as Render, Railway or a VPS. Set `FRONTEND_URL`, `BACKEND_PUBLIC_URL` and `CORS_ALLOWED_ORIGINS`.
- Free instances that sleep can interrupt background jobs and the scheduler. Use an always-on instance for production.

Full guide: `docs/DEPLOYMENT.md`.

## Security

- Firebase ID-token verification on every user route
- Zod validation on every endpoint
- Rate limiting, stricter on AI routes
- Helmet and strict CORS
- Shared-secret authentication (timing-safe) for n8n and internal routes
- Signed OAuth `state`
- Encrypted credentials at rest and a WordPress SSRF guard
- HTML sanitization of generated articles
- Structured logs with secret redaction

Never commit `.env` files, service-account JSON or API keys. Add them to `.gitignore`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Backend exits at start | Read the printed list of missing or invalid environment variables. |
| `EADDRINUSE :::4000` | Another backend is running. Close it, or find it with `netstat -ano \| findstr :4000` and stop it with `taskkill /PID <id> /F`. |
| Firestore `FAILED_PRECONDITION: index` | Run `firebase deploy --only firestore` and wait for indexes to build. |
| Login works but the API returns 401 | The backend `FIREBASE_PROJECT_ID` must match the frontend's project. |
| Cloudinary rejects the upload | File too large for your plan, or the format is not allowed. |
| Analysis fails with a Gemini "high demand" error | Retry later or switch `GEMINI_MODEL` to another available model. |
| Meta permission error | The permission is missing from the app use case, or the user lacks a role on the app. |
| Facebook post not visible to others | The Meta app is still in Development mode. Go Live. |
| Instagram "could not process the video" | Use an H.264/AAC MP4, 9:16, 3 seconds to 15 minutes. |
| Facebook reel has a copyright claim | The audio is claimed by a rights holder. Use royalty-free music. |
| WordPress 401/403 | See `docs/WORDPRESS_SETUP.md`. |

## Known limits

- Search keyword suggestions come from the AI model, not a live keyword-volume database.
- Website traffic analytics need the optional GA4 service-account variables.
- Videos are held in memory while being sent to Gemini, so keep `MAX_UPLOAD_MB` modest on small instances.
- Instagram Reels and Facebook Reels have their own format and copyright rules.
- There is no automated test suite yet. Verification so far is type-checking, production builds, workflow validation and manual end-to-end testing.

## Roadmap

- YouTube publishing
- Publishing to a school website's "latest activities" admin API
- Brand-specific caption templates (emoji-led marketing style with event details and hashtag sets)
- Durable job queue and cold-start recovery for hosts that sleep
- Saving the proper post permalink for Facebook and Instagram links

## Documentation

- `docs/SETUP.md` — complete setup
- `docs/META_SETUP.md` — Meta app, Instagram and Facebook
- `docs/WORDPRESS_SETUP.md` — website publishing
- `docs/N8N_SETUP.md` — n8n workflows
- `docs/API.md` — API reference
- `docs/DEPLOYMENT.md` — production deployment

## License

Add your license here (for example MIT). Without a license file, others cannot legally reuse the code.
