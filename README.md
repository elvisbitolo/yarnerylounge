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
- Events with RSVPs, recurring-event expansion, timezone-aware calendar views, and email reminders (daily cron)
- Groups, neighbourhoods, spaces, availability/hangouts, and a community feed with post actions
- **Real-time chat** — two-pane inbox, instant delivery, timezone-aware timestamps
- Member profiles with social-link visibility controls, signature-colour customization, similar-member discovery, topics, leaderboard, Daily Match, and portfolios
- In-app notifications, member-controlled browser push (VAPID), and transactional email (Resend)
- Notification preferences for chat, events/recordings, Daily Match, and weekly digest; unread counts, mark-as-read controls, and push-subscription setup
- Member re-engagement reminders after two days of inactivity, delivered through in-app and email channels
- Optional WhatsApp notifications for chat DMs and mentions when a member links and enables WhatsApp
- Membership gating via Shopify, with a transparent open-access bypass flag
- Secret Yarnery availability announcements when the designated account transitions from offline to online
- Optional room-entry activity notifications for eligible members (implementation status depends on the branch/deployment)

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
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` — browser push delivery; each member must opt in through browser permission and subscription setup.
- `RESEND_API_KEY` and the configured sender identity — transactional email delivery.
- `SHOPIFY_WEBHOOK_SECRET` and Shopify configuration — membership/payment webhooks; use the repository's `.env.example` as the canonical list of required variables.
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

## Member notifications

The notification system supports multiple delivery channels with member preferences:

- **In-app notifications** are stored and reflected in the notification page and navigation bell.
- **Browser push** uses the Web Push protocol and VAPID keys. Members must explicitly enable it and grant browser permission; the app cannot silently grant permission. Existing browser subscriptions are reconciled with the server when a signed-in member returns.
- **Email** is sent through Resend for supported notification types. Preferences can control messages, events/recordings, Daily Match, and the weekly digest. Security-related password-change emails are sent independently of optional marketing/activity preferences.
- The unread badge is based on the database unread count, not just the most recent page of notifications. The bell refreshes periodically and also reacts to push-driven updates.
- Re-engagement reminders target members who have been inactive for more than two days. Delivery uses the app and email channels, with shared delivery limits to reduce repeat notifications.
- Notification delivery is best-effort across external services. Check Vercel Runtime Logs and the provider's delivery status when a notification is not received.

### Availability and room activity

The community includes presence/availability features and notification fan-out for selected events. The Secret Yarnery availability announcement is intended to notify eligible members when the designated account transitions from offline to online. Room-entry activity notifications have a separate member preference and are distinct from per-member profile watch subscriptions. Confirm the target branch and deployment before assuming a feature is active in production.

### Member profiles and social links

- Profile social links support member-controlled visibility: visible to signed-in members by default, or private to the member and community moderators/owners.
- Signature colours can be customized with presets and an interactive colour picker.
- Similar-member recommendations, profile discovery, and onboarding preferences help members personalize their community experience.

### Events, calendar, and public feeds

- Recurring events are expanded into upcoming occurrences before sorting and limiting results, so an older recurring-event anchor does not automatically hide its next occurrence.
- Calendar navigation and availability entry use a selected IANA time zone; recurring availability preserves the intended wall-clock time, and displays account for daylight-saving changes.
- The public landing-page events endpoint can include upcoming scheduled events, including members-only events. Availability hangouts are included only when explicitly pinned, and public projections omit member identity, notes, and room details.
- Scheduled email reminders and other scheduled tasks are protected by `CRON_SECRET`. Cron endpoints fail closed when the secret is missing or empty.

### Recordings and live rooms

- Live rooms use 8x8 / JaaS (Jitsi).
- The recordings library includes date-range filtering.
- Recording-ready email notifications are sent after a recording is persisted as ready, subject to the applicable email delivery configuration and preferences.

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