# Meta (Instagram + Facebook) setup

Publishing uses the official Instagram Graph API (Reels: `media_type=REELS`, then `media_publish`) and the Facebook Pages video API. Instagram **personal** accounts cannot publish through the API; you need a **Business or Creator** account linked to a Facebook Page.

## Prepare accounts
1. Switch the Instagram account to Professional (Business or Creator).
2. Link it to a Facebook Page (Page settings → Linked accounts).
3. You must be an admin of the Page.

## Create the Meta app
1. developers.facebook.com → My Apps → Create app → type **Business**.
2. Add products **Facebook Login** (or Facebook Login for Business) and **Instagram Graph API**.
3. Facebook Login → Settings → **Valid OAuth Redirect URIs**: `<BACKEND_PUBLIC_URL>/api/accounts/callback/meta` (local: `http://localhost:4000/api/accounts/callback/meta`).
4. App settings → Basic: copy **App ID** and **App Secret** to `META_APP_ID`, `META_APP_SECRET`.

## Permissions requested
`pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_metadata, read_insights, instagram_basic, instagram_content_publish, instagram_manage_insights, business_management`

## Development vs live mode (important)
- **Development mode**: only people with a role on the app (admins, developers, testers) can log in, and the permissions work for them without App Review. This is enough to publish to your own accounts.
- To let other people connect their accounts you must pass **App Review** for each permission, complete Business Verification and switch the app to Live. That is Meta's requirement and cannot be bypassed in code.

## Connect in the app
Connected accounts → **Connect Instagram & Facebook** → log in → select the Pages and Instagram accounts to grant. Each Page becomes a Facebook account and each linked Instagram professional account becomes an Instagram account. Use **Test connection** to verify.

## Video requirements enforced
Reels: MP4 (H.264/AAC), 3 s to 15 min, up to 300 MB, ideally 9:16. Non-MP4 uploads are transcoded by Cloudinary on demand. Facebook: up to 10 GB. The video URL must be publicly reachable (Cloudinary).

## Tokens
Page access tokens derived from a long-lived user token do not expire, but become invalid if the user changes their password, removes the app or loses Page access. The account is then marked `expired`, the failed job shows `META_TOKEN_EXPIRED`, and **Reconnect** fixes it.

## Analytics availability
Instagram: views, reach, likes, comments, shares, saves. Facebook: video views, unique reach, reactions, comments. Metrics a platform does not return are shown as n/a and never estimated.
