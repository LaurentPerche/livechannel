# LiveChannel

LiveChannel turns a user’s YouTube subscriptions into a continuous personal video channel. The user signs in with Google, syncs YouTube subscriptions, presses play once, and watches a scheduled stream from creators they already follow.

The v1 product loop is:

sign in -> sync subscriptions -> press play -> continuous channel -> new upload notification -> Watch now -> drop current video -> recalculate forward

LiveChannel embeds YouTube videos with the YouTube IFrame Player API. It does not restream, proxy, download, or redistribute YouTube videos.

## Architecture

- Cloudflare Workers: HTTP app, API routes, OAuth callback, scheduled polling.
- Durable Objects: one `UserScheduler` object per user for playback state and forward-only queue decisions.
- Workers KV: users, OAuth token metadata, subscriptions, cached videos, push subscriptions.
- Cron Triggers: `*/5 * * * *` polls active users for new uploads.
- Web Push: browser subscriptions are stored in KV; v1 sends a signed push wake-up and the service worker fetches the pending notification payload.
- Frontend: static files in `public/`, served by Workers static assets.

Playback states are always named `Fresh`, `Catch-up`, and `Replay`.

## Repository Layout

```txt
/
  README.md
  package.json
  tsconfig.json
  wrangler.jsonc
  .gitignore
  /src
    index.ts
    auth.ts
    youtube.ts
    scheduler.ts
    push.ts
    types.ts
    utils.ts
  /public
    index.html
    app.js
    styles.css
    sw.js
```

## Local Development

Install dependencies:

```sh
npm install
```

Create `.dev.vars` from the example:

```sh
cp .dev.vars.example .dev.vars
```

Then fill in local values as needed:

```sh
ENVIRONMENT=development
SESSION_SECRET=replace-with-a-long-random-string
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8787/auth/callback
YOUTUBE_API_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

Run locally:

```sh
npm run dev
```

Open `http://localhost:8787`, then use `Seed demo` or call:

```sh
curl -X POST http://localhost:8787/api/dev-seed
```

The dev seed route only runs when `ENVIRONMENT=development`. It creates a fake signed-in user, fake subscriptions, and playable public YouTube video IDs.

## Cloudflare Setup

Create KV namespaces:

```sh
npx wrangler kv namespace create USERS_KV
npx wrangler kv namespace create VIDEOS_KV
npx wrangler kv namespace create PUSH_KV
```

Replace the placeholder IDs in `wrangler.jsonc`.

The Durable Object binding is already configured:

```jsonc
"durable_objects": {
  "bindings": [{ "name": "USER_SCHEDULER", "class_name": "UserScheduler" }]
},
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["UserScheduler"] }]
```

Set production secrets:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REDIRECT_URI
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put SESSION_SECRET
```

Before public deployment, set `ENVIRONMENT` to `production` in `wrangler.jsonc` or an environment-specific Wrangler config.

Deploy:

```sh
npm run deploy
```

Cloudflare Workers can also be connected to this GitHub repository through the Workers dashboard GitHub integration.

## Google OAuth Setup

In Google Cloud Console:

1. Create an OAuth client for a web application.
2. Add `http://localhost:8787/auth/callback` for local development.
3. Add your deployed Worker callback URL, for example `https://livechannel.<account>.workers.dev/auth/callback`.
4. Enable these scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/youtube.readonly`

OAuth tokens are stored server-side only in KV and never exposed to the frontend.

## YouTube API Setup

Enable YouTube Data API v3 and create an API key. LiveChannel uses:

- `subscriptions.list` with the user OAuth token.
- `channels.list` to find each channel uploads playlist.
- `playlistItems.list` for recent uploads.

The upload playlist path is used instead of `search.list` to reduce quota pressure. Recent upload responses are cached in KV.

## VAPID Setup

Generate VAPID keys:

```sh
npx web-push generate-vapid-keys
```

Set the public and private keys with Wrangler secrets. The public key is returned by `/api/config` so the browser can create a Push subscription.

## API Routes

- `GET /`
- `GET /auth/login`
- `GET /auth/callback`
- `POST /api/sync-subscriptions`
- `GET /api/channel-state`
- `GET /api/next`
- `POST /api/video-ended`
- `POST /api/jump`
- `POST /api/notifications/register`
- `POST /api/poll-user`
- `POST /api/dev-seed`

`POST /api/jump` accepts:

```json
{ "videoId": "abc123" }
```

Jump behavior is forward-only: the current video is marked skipped, the requested video becomes current, the skipped video is not put back into the queue, and the timeline is recalculated forward.

## MVP Limitations

- Web Push payload encryption is deferred; v1 sends a signed push wake-up and fetches the pending same-origin notification payload from the service worker.
- KV active-user indexing is simple and can race under heavy concurrent writes.
- YouTube polling is sequential and should be batched or rate-limited more carefully before scale.
- OAuth storage should move to stricter encrypted-at-rest handling before sensitive production use.
- Observability, retry backoff, and user-facing error recovery are intentionally minimal.

## Next Steps

- Add deployment environments for `development`, `staging`, and `production`.
- Add integration tests for scheduler transitions: Fresh -> Catch-up -> Replay and jump skip behavior.
- Encrypt OAuth refresh tokens before storing them in KV.
- Add quota-aware polling windows per subscription.
