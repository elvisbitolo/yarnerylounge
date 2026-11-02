# Secret Yarnery (Community)

A members-only community for crochet and yarn crafters. Live video lounges,
courses, events, groups, spaces, and real-time chat — with a paid-membership
gate, international (EN/FR/DE) support, and an instant messaging experience
that works across time zones.

## Stack

- **Next.js** (App Router, React Server Components, `reactCompiler`) — `src/app`
- **Supabase** — Auth, Postgres, and Realtime (WebSockets)
- **Prisma** — type-safe Postgres access; numbered migrations in `prisma/migrations`
- **next-intl** — internationalization for `en`, `fr`, `de` (`localePrefix: "never"`)
- **8x8 / JaaS (Jitsi)** — live video rooms
- **Shopify** — membership transactions + webhooks; governed by the open-access flag
- **Vercel** — hosting; auto-deploy from `main`

## Features

- Live video lounges with real-time chat (8x8/JaaS)
- Courses with lessons and progress tracking
- Events with RSVPs and email reminders (daily cron)
- Groups, neighbourhoods, spaces, and a community feed
- **Real-time chat** — two-pane inbox, instant delivery, timezone-aware timestamps
- Topics, leaderboard, match, portfolio, and profile discovery
- Web push notifications (VAPID) and transactional email (Resend)
- Membership gating via Shopify, with a transparent open-access bypass flag

## Local development

Prerequisites: Node.js, a Supabase project, and the values in `.env.example`.

```bash
npm install
cp .env.example .env.local   # fill in real values
npx prisma migrate deploy    # applies migrations to your Postgres
npm run dev                  # http://localhost:3000
```

### Environment notes

`.env.example` documents every variable with usage notes and how to generate key
material. A few that are easy to miss:

- `MESSAGE_ENCRYPTION_KEY` — **required**. A base64 256-bit key. Chat messages
  are stored AES-256-GCM encrypted at rest and this key lives server-side only;
  the app **fails closed** if it is missing.
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` — admin client used for auth
  verification, session refresh, and OAuth repair.
- `CRON_SECRET` — guards `vercel.json` cron endpoints.
- The Supabase+Vercel integration variables (`POSTGRES_PRISMA_URL`,
  `POSTGRES_URL_NON_POOLING`) are used automatically when `DATABASE_URL` /
  `DIRECT_URL` are empty.

> Never commit real secrets. `.env.local` is gitignored; only the template in
> `.env.example` is committed.

## Key architecture

### Auth

- Supabase Auth handles login (email/password and Google OAuth), but the app
  issues its own **opaque `community-auth` httpOnly cookie** pointing at a
  server-side `Session` row in Postgres — Supabase tokens never live in the
  browser.
- The server is the single owner of the access/refresh tokens. Rotation happens
  transparently inside the DB (serialized per session with an advisory lock so
  concurrent requests never race the single-use refresh token), and the cookie
  is re-issued on every check with a rolling window — so an active member is
  never logged out by token expiry.
- RLS policies are enabled on chat tables; the Postgres role the app uses
  bypasses RLS, so application reads/writes are unaffected.

### Realtime chat

- Writes go through the regular API → Postgres path (the durable source of
  truth). Supabase Realtime (`postgres_changes` on the `supabase_realtime`
  publication) delivers a **change event** the instant a message row lands; the
  client then **refetches** the message list, which the server decrypts.
- Why refetch: message text is encrypted at rest with a server-only key, so
  ciphertext (or plaintext) never travels in a realtime payload. Event metadata
  is enough to trigger delivery; a short polling interval remains as resilience.
- The inbox rail subscribes to `Conversation` updates too, so previews and
  ordering stay live without a reload.
- Migration `10_chat_realtime` registers the chat tables in the publication and
  creates the participant-scoped RLS policies — keep it applied or realtime
  silently degrades to polling.

### Chat encryption

Messages are encrypted with AES-256-GCM before storage using a single
`MESSAGE_ENCRYPTION_KEY`. The key is only used in the server runtime; clients
never have it. If the key is misconfigured, sending a message refuses to store
plaintext rather than leaking it.

## Database

Prisma schema lives in `prisma/schema.prisma`; generated client and models in
`src/generated/prisma`. Migrations are applied with:

```bash
npx prisma migrate deploy
```

## Quality & deploy

```bash
npm test     # server unit tests (node:test)
npm run lint # eslint
npm run build # prisma generate + next build (must pass before deploy)
```

Pushes to `main` auto-deploy to Vercel. Scheduled jobs live in `vercel.json`
(two once-per-day crons: event reminders and scheduled questions). Note Vercel's
Hobby plan rejects more frequent (sub-daily) cron expressions at deploy time.

## Project layout

- `src/app` — App Router routes and API routes (`src/app/api`)
- `src/components` — shared client components (Nav, auth widgets, etc.)
- `src/lib/server` — server-only logic: auth, sessions, chat, crypto, rate limits
- `src/lib` — shared client libs (realtime hooks, time formatting, i18n helpers)
- `prisma/migrations` — ordered DB migrations
- `messages/` — `en`, `fr`, `de` translation catalogs