# TuneDeck

A private, offline-friendly PWA for managing a personal musical repertoire: what you want to play,
what you're learning, what you can play, the tuning, the Songsterr tab, and every YouTube
original / cover / lesson / backing track — one tap away. See [`tunedeck-product-spec.md`](tunedeck-product-spec.md).

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Neon Postgres** via Drizzle ORM (`@neondatabase/serverless` HTTP driver)
- **Neon Object Storage** (S3-compatible) for PDF/MIDI — browser uploads with presigned URLs
- **PWA**: web manifest with Android **Share Target**, hand-written service worker (`public/sw.js`)
- **Offline**: IndexedDB cache + mutation outbox (`src/lib/client/store.ts`)

## How it works

- **Local-first data.** The client keeps a full snapshot in IndexedDB and renders from it instantly.
  Every change is an idempotent *op* (`src/lib/shared/types.ts`) applied optimistically by a shared
  reducer (`src/lib/shared/reduce.ts`) and queued. `POST /api/ops` replays the queue in one Neon batch;
  `GET /api/snapshot` pulls fresh state and pending ops are rebased on top. Works fully offline.
- **Auth.** One access code → server checks `sha256(UPPERCASE(code))` against `ACCESS_CODE_HASH` →
  creates a device session row and sets a signed, HttpOnly, 400‑day cookie. The raw code is never stored.
  Settings lists devices and can sign out the others.
- **YouTube enrichment** never blocks saving: the video ID and thumbnail are derived instantly, then
  `/api/enrich` fetches title/channel/duration (YouTube Data API if `YOUTUBE_API_KEY` is set, otherwise
  oEmbed + watch page), cached in the `media_cache` table. Failed/offline enrichments retry later.
- **Songsterr** is just a canonical HTTPS link (opens the app when installed). Pasting one best-effort
  reads the page title to prefill song/artist.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run db:migrate           # applies drizzle/ migrations to Neon
npm run storage:cors         # once: lets the browser PUT/GET presigned URLs
npm run dev
```

The service worker only registers in production builds (`npm run build && npm start`).

## Deploy

GitHub → Vercel. Set the same environment variables in the Vercel project; pushes to `main`
deploy to production, branches/PRs get preview deployments.

## Changing the access code

```bash
printf '%s' 'NEWCODE' | tr a-z A-Z | shasum -a 256
```

Put the hash in `ACCESS_CODE_HASH` (locally and on Vercel) and redeploy.
