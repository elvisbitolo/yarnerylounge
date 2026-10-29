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
- Optional WhatsApp notifications for chat DMs and mentions when a member links and enables WhatsApp
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
- WhatsApp notifications use `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
  for the Cloud API. `WHATSAPP_BUSINESS_ACCOUNT_ID` identifies the business
  account where needed. Configure `WHATSAPP_VERIFY_TOKEN` for Meta's webhook
  subscription handshake, and `WHATSAPP_APP_SECRET` (or `META_APP_SECRET`)
  for validating the `X-Hub-Signature-256` signature on webhook POST requests.
  These are server-only secrets and must be set in Vercel for Production (and
  Preview if testing there). The App Secret is different from both the access
  token and webhook verification token. If the App Secret is missing, webhook
  POST requests return HTTP 503; an invalid signature returns HTTP 401.
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

### WhatsApp notifications

- Members can link a WhatsApp number from **Settings → Social** and enable or
  disable optional notifications. WhatsApp notifications supplement in-app and
  push notifications; they do not replace them.
- Outgoing notifications use the WhatsApp Cloud API. A successful API response
  means Meta accepted the send request, not that WhatsApp delivered or the
  recipient read the message. Check the corresponding delivery-status webhook
  event to distinguish `sent`, `delivered`, `read`, and `failed`.
- Configure the webhook in Meta to use `/api/webhooks/whatsapp`. Subscribe to
  the `messages` webhook field and configure the same verification token as
  `WHATSAPP_VERIFY_TOKEN`. Meta's POST requests must include a valid signature
  checked with `WHATSAPP_APP_SECRET` or `META_APP_SECRET`.
- The webhook currently updates linked-account activity for matching incoming
  WhatsApp senders and logs delivery receipts. It does **not** import WhatsApp
  conversations into the community's in-app chat history.
- If logs show `whatsapp.webhook_secret_missing`, set the Meta App Secret in
  the Vercel environment and redeploy. If logs show `Invalid webhook signature`,
  confirm that the secret belongs to the same Meta app configured for the
  webhook. Never print or commit any token or secret.

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