# REST API

Base `/api`. Auth: `Authorization: Bearer <Firebase ID token>` unless noted. Errors: `{ "error": { "code", "message", "details?", "requestId" } }`. Long-running endpoints return `202`; progress appears on Firestore documents that the frontend observes in realtime.

## Videos
| Method | Path | Description |
|---|---|---|
| POST | /videos/upload-signature | Signed Cloudinary params for direct browser upload |
| POST | /videos/upload | Register an uploaded video `{publicId, filename, brandId?}` (verified with Cloudinary) |
| POST | /videos/analyze | `{videoId}` → 202 |
| GET | /videos, /videos/:id, /videos/:id/analysis | |
| DELETE | /videos/:id | Fails while content exists |

## Pipeline
| Method | Path | Description |
|---|---|---|
| POST | /seo/analyze | `{videoId, context{brandId,brand,country,city,audience,industry,language,goal}}` → 202 `{seoId}` |
| GET | /seo/:id | |
| POST | /content/generate | `{videoId, seoId, brandId, platforms[]}` → 202 `{contentId}` |
| POST | /content/regenerate | `{contentId, scope: all\|platform\|field, platform?, field?, instruction?}` → updated content |
| GET | /content | Filters `q,status,platform,brandId,from,to,limit` |
| GET/PUT/DELETE | /content/:id | PUT `{title?, content{...}}` creates a version |
| POST | /content/:id/duplicate | |
| GET | /content/:id/versions | |
| POST | /content/:id/restore | `{versionId}` |

## Publishing
| Method | Path | Description |
|---|---|---|
| POST | /publish | `{contentId, targets[{platform,accountId}], options{wordpressStatus?}}` → 202 |
| POST | /publish/schedule | `{contentId, targets[], scheduledAt (ISO with offset), timezone, options}` |
| POST | /publish/retry | `{jobId}` (failed jobs, max 5 retries) |
| GET | /publishing/jobs | `contentId,status,limit` |
| GET | /publish/scheduled | |
| DELETE | /publish/scheduled/:id | Cancel |

## Accounts, brands, settings, analytics
| Method | Path | Description |
|---|---|---|
| GET | /accounts | |
| POST | /accounts/connect | `{provider:"meta"}` → `{authUrl}`; or `{provider:"wordpress", siteUrl, username, applicationPassword}` |
| GET | /accounts/callback/meta | **Public** OAuth redirect (signed state) |
| POST | /accounts/:id/test | |
| DELETE | /accounts/:id | Blocked while scheduled posts use it |
| GET/POST/PUT/DELETE | /brands, /brands/:id | |
| GET/PUT | /settings | `/settings/system` returns readiness flags (no secrets) |
| GET | /analytics?days=30 | Aggregated real metrics |
| POST | /analytics/sync, /analytics/insights | Collect metrics; AI insights need ≥3 posts with metrics |
| GET | /dashboard, /activity | |
| GET | /health | **Public** |

## Machine endpoints
| Method | Path | Description |
|---|---|---|
| POST | /webhooks/n8n | Header `x-aca-secret`. `{event: stage.completed\|stage.failed, stage, userId, resourceId, requestId?, error?}` |
| POST | /internal/stages/:stage/run | Header `x-internal-secret`. `{userId, resourceId, requestId}`. Stages: video-analysis, seo-analysis, content-generation, publishing, analytics-sync |
| POST | /internal/scheduler/claim | Atomically turns due scheduled posts into queued jobs |
| POST | /internal/analytics/sync-all, /internal/n8n-error | |

## Statuses
Content: draft, analyzing, generating, ready, scheduled, publishing, published, failed, cancelled. Job: queued, publishing, published, failed, cancelled. Failed jobs store `errorCode, errorMessage, platform, timestamp, requestId, retryCount`.
