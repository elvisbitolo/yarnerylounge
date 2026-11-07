# Secret Yarnery

Secret Yarnery is a members-only community for crochet and yarn crafters. Members can connect, share work, join groups, attend events, take part in live video lounges, and publish videos in the shared Community Studio.

Production: [christasspeakeasy.com](https://www.christasspeakeasy.com)

## Features

- **Member accounts and access levels** — authenticated profiles, membership plans, account settings, and staff tools.
- **Member dashboard** — community activity, upcoming events and rooms, featured videos, member discovery, notifications, and contribution progress.
- **Community feed** — posts, photos, video attachments, polls, questions, comments, and reactions.
- **Community Studio** — every signed-in member can upload, publish, and watch tutorials, project videos, and stitch-alongs. Members can delete their own uploads; Studio moderators can manage the full library.
- **Live video lounges** — hosted video rooms powered by JaaS (8x8/Jitsi), with room chat and related live-community features.
- **Groups and spaces** — member-created groups, neighbourhoods, and shared community spaces.
- **Events and availability** — event listings, RSVPs, and member availability.
- **Messaging** — member-to-member conversations with real-time delivery and encrypted message storage.
- **Profiles and portfolios** — member profiles, project showcases, and community discovery.
- **Topics and recognition** — discussions, leaderboard, points, badges, and member recognition.
- **Notifications** — in-app notifications, optional web push, and transactional email.
- **Recordings** — a member-facing library for available lounge recordings.

## Technology stack

Only technologies used by this repository are listed here.

| Layer | Technology | Usage |
| --- | --- | --- |
| Runtime | Node.js 24 | JavaScript server runtime |
| Language | JavaScript (ES modules) | Application and server code |
| UI | React 19 | Component-based user interface |
| Framework | Next.js 16 (App Router) | Routing, server rendering, and API routes |
| Styling | CSS Modules | Component-scoped styles |
| Database | PostgreSQL | Application data |
| Database access | Prisma 7 | Schema, generated client, and migrations |
| Authentication, realtime, and storage | Supabase | Auth, Realtime subscriptions, and Storage |
| Live video | 8x8 JaaS / Jitsi | Video lounges |
| Membership checkout | Shopify | Membership transactions and webhooks |
| Media storage | Supabase Storage and Vercel Blob | Studio/recording assets and feed media |
| Hosting | Vercel | Application hosting and deployments |
| Internationalization | next-intl | English, French, and German translations |
| Web push | web-push (VAPID) | Browser push notifications |
| Icons | lucide-react | Interface icons |
| Image cropping | react-easy-crop | Image cropping UI |

React Compiler is enabled in the Next.js configuration.

## Getting started

### Requirements

- Node.js 24.x
- npm
- A Supabase project with PostgreSQL and Storage enabled
- Credentials for the external services used by the features you want to run (JaaS and Shopify, for example)

### Install

```bash
npm install
cp .env.example .env.local
```

Add the appropriate values to `.env.local`. Never commit real credentials.

### Database

Configure the PostgreSQL connection values in `.env.local`, then apply the Prisma migrations:

```bash
npm run db:migrate
```

Generate the Prisma client when needed:

```bash
npm run db:generate
```

### Run locally

```bash
npm run dev
```

The application will be available at http://localhost:3000.

## Environment configuration

Use [`.env.example`](.env.example) as the source of truth for environment variable names and comments. Important configuration includes:

- **Supabase:** public URL and anon key, server URL, and service-role key.
- **PostgreSQL:** `DATABASE_URL` and, where required, `DIRECT_URL`. Supabase/Vercel connection variable names are also supported.
- **Chat security:** `MESSAGE_ENCRYPTION_KEY` is required to send chat messages. It must be a base64-encoded 256-bit key. Messages use AES-256-GCM encryption at rest; the application refuses to store plaintext if the key is missing.
- **Vercel Blob:** `BLOB_READ_WRITE_TOKEN` for feed media uploads.
- **JaaS:** `JITSI_APP_ID`, `JITSI_API_KEY_ID`, and `JITSI_PRIVATE_KEY` for signed meeting access; configure `JITSI_WEBHOOK_SECRET` for recording webhooks.
- **Shopify:** access token and webhook secret for membership transaction handling. `SHOPIFY_OPEN_ACCESS` is an explicit switch for a temporary open-access period; keep it disabled for normal paid-plan gating.
- **Studio:** `STUDIO_ADMIN_EMAILS` configures the Studio moderation allowlist. All signed-in members can publish; upload ownership controls who can remove a video, while moderators can manage the full library.
- **Web push:** VAPID public/private keys and subject are optional.
- **Email:** `RESEND_API_KEY` and `EMAIL_FROM` enable transactional email delivery; without the API key, email attempts are logged by the server.
- **Cron:** `CRON_SECRET` protects scheduled Vercel endpoints.
- **Origins:** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CANONICAL_HOST`, and `NEXT_PUBLIC_OWN_HOSTS` must match the domains used by the deployment.

Never paste production secrets into source code, issues, or pull requests.

## Architecture notes

### Authentication and sessions

Supabase Auth handles identity verification. The application maintains its own opaque, HTTP-only `community-auth` cookie backed by a server-side session record in PostgreSQL. Supabase access and refresh tokens remain on the server, where refresh-token rotation is coordinated per session.

### Messaging and encryption

Messages are persisted through the application and PostgreSQL. Supabase Realtime signals database changes to connected clients; clients then request message data from the server. Message bodies are encrypted at rest with AES-256-GCM using the server-only `MESSAGE_ENCRYPTION_KEY`. Realtime events do not carry message plaintext.

### Studio and media

Studio video files and cover images are uploaded directly to Supabase Storage using short-lived signed upload URLs. The application stores the video catalogue metadata and issues signed URLs for playback. Feed media uploads use Vercel Blob.

### Database

The Prisma schema is in `prisma/schema.prisma`; migrations are in `prisma/migrations`. The generated Prisma client is written to `src/generated/prisma`.

Apply migrations with:

```bash
npm run db:migrate
```

## Quality checks

```bash
npm test          # Node.js unit tests
npm run lint      # ESLint
npm run build     # Generate Prisma client and build Next.js
npm run smoke     # Application smoke test
npm run test:e2e  # Playwright end-to-end tests
```

Run the relevant checks before opening a pull request.

## Deployment

The application is hosted on Vercel. Production deployments are connected to the repository's `main` branch. Scheduled jobs are configured in `vercel.json`; their endpoints are protected by `CRON_SECRET`.

## Repository structure

- `src/app` — Next.js pages, layouts, and API routes
- `src/components` — shared React components
- `src/lib` — shared application utilities and client-side helpers
- `src/lib/server` — server-only authentication, database, messaging, storage, and business logic
- `prisma/schema.prisma` — PostgreSQL data model
- `prisma/migrations` — ordered database migrations
- `messages/` — English, French, and German translation catalogs
- `scripts/` — maintenance and smoke-test scripts
- `.env.example` — documented environment variable template
