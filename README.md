# Secret Yarnery — Community Platform

Secret Yarnery is a membership-based online community for crochet and yarn crafters. The platform brings members together through live video lounges, real-time messaging, courses, events, groups, community spaces, recordings, and member discovery.

**Production website:** https://www.christasspeakeasy.com  
**Android app:** Yarnery Lounge (Trusted Web Activity that opens the production website)

## What the platform includes

- **Member accounts** — Supabase authentication, Google OAuth, profile management, and server-managed sessions.
- **Membership access** — Shopify-backed membership transactions and webhooks, plan/tier handling, expiry processing, and a configurable open-access mode.
- **Live lounges** — JaaS (8x8/Jitsi) video rooms with member access and live chat.
- **Messaging** — private conversations with realtime delivery, encrypted message storage, and resilient polling.
- **Community** — feed posts, comments, reactions, member discovery, groups, neighbourhoods, and spaces.
- **Learning** — courses, lessons, and learning progress.
- **Events** — event listings, RSVPs, and scheduled reminder emails.
- **Recordings and Studio** — a member recording library and video publishing/watch experience.
- **Notifications** — in-app notifications, transactional email, web push, scheduled re-engagement, membership-expiry and other automated messages.
- **Internationalisation** — English, French, and German.
- **Connectivity feedback** — a global online/offline notice, retry action, recovery feedback, and alerts when fetch requests fail at the network level.

Feature availability can depend on membership, configured service credentials, and deployment environment.

## Technology

| Area | Technology |
| --- | --- |
| Web application | Next.js App Router, React, JavaScript |
| Styling | CSS Modules |
| Authentication | Supabase Auth and server-managed session cookies |
| Database | PostgreSQL hosted by Supabase |
| Data access | Prisma |
| Realtime | Supabase Realtime |
| Video rooms | JaaS (8x8/Jitsi) |
| Membership commerce | Shopify |
| File storage | Supabase Storage and Vercel Blob (feature-dependent) |
| Email | Resend |
| Web push | VAPID / Web Push |
| Internationalisation | next-intl |
| Hosting and scheduled jobs | Vercel |
| Android wrapper | Trusted Web Activity (Bubblewrap / Android Gradle project) |

## Repository structure

```text
src/
  app/                 Next.js pages, layouts, and API routes
  components/          Shared UI and application-wide components
  generated/prisma/    Generated Prisma client
  lib/                 Shared application utilities and client logic
  lib/server/          Server-only auth, session, messaging, crypto, and services
messages/              en, fr, and de translation catalogs
prisma/
  schema.prisma        Database schema
  migrations/          Ordered PostgreSQL migrations
android-twa-app/       Android Trusted Web Activity project
scripts/               Local smoke-test and maintenance scripts
.env.example           Environment-variable template
vercel.json            Scheduled Vercel cron definitions
```

## Requirements

- Node.js **24.x** (see `package.json`)
- npm
- A Supabase project with PostgreSQL and Auth configured
- Environment variables configured from `.env.example`
- Android Studio / Android SDK only if building the Android TWA

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file and populate it with valid credentials:

   ```bash
   cp .env.example .env.local
   ```

3. Apply the database migrations:

   ```bash
   npx prisma migrate deploy
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

The web application runs at http://localhost:3000.

## Environment configuration

The committed [`.env.example`](.env.example) is the source of truth for supported environment-variable names and setup notes. Configure only the integrations used by the environment, and never commit real credentials.

Important configuration groups include:

- **Supabase:** public URL/anon key, server URL, and service-role key.
- **PostgreSQL / Prisma:** `DATABASE_URL`, `DIRECT_URL`, or the supported Supabase/Vercel connection-variable equivalents.
- **Message encryption:** `MESSAGE_ENCRYPTION_KEY` is required for chat message writes. Generate a base64-encoded 32-byte key:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

  Keep the same key across deployments. The server must fail closed rather than store unencrypted chat messages if this key is missing or invalid.
- **Membership:** Shopify credentials and `SHOPIFY_OPEN_ACCESS`. Keep open access disabled for normal paid-membership enforcement; enable it only for an intentional temporary open-access period.
- **Video:** JaaS app ID, API key ID, private key, and webhook secret.
- **Email and push:** Resend and VAPID credentials where those features are enabled.
- **Scheduled jobs:** `CRON_SECRET`, used to protect cron endpoints.
- **Canonical host:** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CANONICAL_HOST`, and `NEXT_PUBLIC_OWN_HOSTS` must match the deployed domain setup.

For production, set environment variables in the hosting/provider dashboards. Do not copy production secrets into local files that may be committed.

## Architecture notes

### Authentication and sessions

Supabase Auth is used for account authentication. After authentication, the application issues its own opaque, HTTP-only `community-auth` cookie referencing a server-side session record in PostgreSQL. Supabase access and refresh tokens remain server-side rather than being exposed as browser session storage.

The server owns token refresh and session rotation. Keep the session and database migrations in sync when changing authentication behaviour.

### Database and migrations

The Prisma schema is maintained in `prisma/schema.prisma`; migration history lives in `prisma/migrations/`.

Useful commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:status
```

Commit schema changes together with their migration. Do not edit or remove an already-applied production migration to represent a new schema change; create a new migration instead.

### Realtime messaging and encryption

PostgreSQL is the durable source of truth for messages. Supabase Realtime broadcasts database-change events to participating clients, which then request the message list through the application so the server can decrypt it. This avoids sending stored ciphertext or plaintext message bodies in realtime event payloads.

Messages are encrypted at rest with AES-256-GCM using the server-only `MESSAGE_ENCRYPTION_KEY`. Never expose this key to client-side code or logs.

### Global connection status

The shared `ConnectionStatus` component is mounted through the application providers. It listens for browser online/offline events, probes the application origin, offers a retry action, and surfaces rejected network-level `fetch()` requests. It improves visibility into connection problems but does not replace error handling for every HTTP response, media stream, or realtime transport.

### Android application

The Android project is in `android-twa-app/`. It is a Trusted Web Activity configured to launch `https://www.christasspeakeasy.com/dashboard` under the application name **Yarnery Lounge**. The installed Android app loads the live web application; it is not a separate native implementation of the community features.

The TWA relies on the domain's Digital Asset Links association for verified full-screen launch. Changes to the production domain or Android application identity must be reflected in the Android configuration and the website's `/.well-known/assetlinks.json`.

## Scripts and checks

```bash
npm run dev          # Start the local development server
npm run build        # Generate Prisma client and build the Next.js app
npm run start        # Run the production build locally
npm run lint         # Run ESLint
npm test             # Run Node.js unit tests
npm run smoke        # Run authenticated API smoke tests against a running app
npm run test:e2e     # Run Playwright end-to-end tests
npm run test:e2e:headed
```

The smoke test creates a temporary Supabase/Postgres test member and exercises authenticated API reads and a post create/delete cycle. Use a dedicated test environment; it requires privileged Supabase and database credentials and should not be pointed casually at production data.

## Scheduled jobs

Vercel cron definitions are maintained in `vercel.json`. The current schedule includes event reminders, scheduled questions, recording ingestion and cleanup, daily-match processing, a weekly digest, re-engagement messages, and membership-expiry processing.

Cron execution is protected with `CRON_SECRET`. Confirm that the selected Vercel plan supports the configured cron frequencies before deployment; cron frequency availability is plan-dependent.

## Deployment

The production web application is deployed on Vercel. Pushes to `main` trigger the configured production deployment.

Before shipping changes, run the relevant checks:

```bash
npm run lint
npm test
npm run build
```

For changes involving authentication, database writes, or protected APIs, also run the smoke test against a dedicated test environment. Verify the resulting Vercel deployment reaches **Ready** and check the production site after deployment.

## Security

- Never commit `.env.local`, private keys, access tokens, service-role keys, or other secrets.
- Keep `MESSAGE_ENCRYPTION_KEY` server-only and stable across deployments.
- Keep privileged Supabase operations on the server.
- Validate and authorize membership-gated actions on the server; hiding a UI control is not authorization.
- Protect scheduled endpoints with `CRON_SECRET`.
- Keep Shopify and JaaS webhook signature verification enabled.
- Use a dedicated non-production database for destructive tests.
