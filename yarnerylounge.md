# Yarnery Lounge — Migration & Project Progress

Tracked here so there is a single source of truth for where the project stands.
Update this file every time a meaningful chunk of work completes.

## Summary

Yarnery Lounge is fully migrated from Firebase (Auth, Firestore, Cloud Storage,
rules, service accounts) to **Supabase (Postgres) + Vercel** — **Prisma-only**.
Firebase has been **completely removed** from the codebase, dependencies, and
config. Jitsi as a Service (JaaS) replaced LiveKit.

- Supabase project: `pwdopgyvkfsxxcuanoml`
- Supabase URL: `https://pwdopgyvkfsxxcuanoml.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` lives in `.env.local`
- **Never modify `prisma/schema.prisma`** — the sole exception was adding
  `Event.membersOnly` (migration `4_event_members_only`, applied to production).

## Access model

- **Open access is ON** (`SHOPIFY_OPEN_ACCESS` unset → `isOpenAccess()` true):
  every signed-up/signed-in user gets **full host-level access** (plan
  `moving-in`, `OPEN_ACCESS_PLAN = "moving-in"`). The signup wall, capability
  gating and the `/plan-expired` redirect are bypassed.
- When the community grows, subscription enforcement returns by setting
  `SHOPIFY_OPEN_ACCESS=false` (no code change needed).

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Postgres schema + ETL (with `--reset`); Prisma at `prisma/schema.prisma` | ✅ done |
| 2 | RLS/Supabase setup | ✅ done |
| 3 | Read cutover — Prisma reads everywhere | ✅ done |
| 4 | Write cutover — Prisma writes everywhere | ✅ done |
| 5 | Supabase Auth (email already, Google via Supabase OAuth) | ✅ done |
| 6 | Session/refresh server-side | ✅ done |
| 7 | Remove Firebase entirely (SDKs, deps, scripts, rules) | ✅ done |

## Phase 7 — Firebase removal (done)

Firebase is fully removed — app code, dependencies and config:

- `src/lib/firebase/` deleted. Client auth now lives in
  `src/lib/auth-client.js` — a Firebase-shaped facade (`auth.currentUser`,
  `onAuthStateChanged(auth, cb)`) backed by the Supabase browser client, so the
  24 components that used the old `firebase/client` API kept their call sites
  with a one-line import swap.
- `src/app/api/me/route.js`: `adminAuth().updateUser` → `supabaseAdmin.auth.admin.updateUserById` (display-name sync).
- `src/app/api/admin/members/[id]/route.js`: `adminAuth().deleteUser` → `supabaseAdmin.auth.admin.deleteUser`.
- `src/lib/server/auth.js`: Supabase-only. `verifySupabaseToken` uses the service
  role `getUser`; the access JWT is pre-filtered by `isSupabaseAccessJwt`
  (checks `role === "authenticated"` and the `iss = https://<ref>.supabase.co/auth/v1` ref).
- `mapSupabaseUser` uses the Supabase `user.id` as the uid (verified: 0 auth
  users carry `app_metadata.firebase_uid`, so no legacy mapping is needed).
- **Bug fixed**: `isSupabaseAccessJwt` previously required `iss === "supabase"`
  and rejected every real Supabase access token — restored correct issuer
  matching in `auth-core.js`.
- Deps removed: `firebase`, `firebase-admin` (defaults to a clean `npm install`).
- `.env.example` cleaned (no Firebase/LiveKit keys); `storage.rules` deleted.
- Scripts: `migrate-firestore-to-postgres.js` + `backfill-event-members-only.js`
  deleted (no legacy Firestore data remains to migrate/backfill);
  `set-owner.mjs` + `create-owner.mjs` rewritten as Supabase +
  pg-based (`create-owner` creates the Supabase user, Postgres `User` row
  (`role = 'owner'`) and an open-access `Subscription`).
- Last pass (2026-09-11): `app_metadata.firebase_uid` fallback removed from
  `auth-core.js`/`auth-client.js`; `src/app/api/auth/migrate/route.js` deleted;
  `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`
  deleted; `FIREBASE_*`/`NEXT_PUBLIC_FIREBASE_*` env vars removed from
  `.env.local` and Vercel; `ci.yml` and `.gitignore` firebase entries removed.

## LiveKit removal (done)

LiveKit was already superseded by **JaaS (Jitsi as a Service)**; the stubbed
LiveKit surface is now gone:

- Deleted `src/lib/server/livekit.js` and API routes
  `src/app/api/rooms/[id]/participants/`,
  `src/app/api/rooms/[id]/participants/[identity]/`,
  `src/app/api/rooms/[id]/end/`.
- `sidebar.js`, `members/page.js`, `dashboard-command.js` simplified (live-viewer
  counts are `0` until a live presence source is added).

## Schema notes

- `Event.membersOnly` added via migration `4_event_members_only` (SQL:
  `ALTER TABLE "Event" ADD COLUMN "membersOnly" BOOLEAN NOT NULL DEFAULT false;`),
  applied to production Supabase with `prisma migrate deploy`. ETL maps
  `membersOnly` (`toBool`) and `perks.listMembersOnlySessions` filters on it.
## Verification Commands

- Lint: `npx eslint <files>` (0 errors on changed files; pre-existing warnings:
  `window.location.assign` in `src/app/login/page.js`)
- Tests: `npm test` (250 tests — node:test on `*-core.js` mappers)
- Build: `npm run build`
- Smoke test: `npm run smoke` (needs a running `next dev`; creates + cleans up a
  throwaway Supabase user; asserts session, protected reads, write/delete cycle,
  and the unauthenticated 401).
- Migrations: `npm run db:migrate` (deploy), `npm run db:status`.

## Dev Notes

- Only `*-core.js` files are node-tested (`node --test`).
- `.clinerules` prefers `run_commands`; a `bash`/shell tool has been used
  successfully all session.

## Phase 8 — Speakeasy feature completion

- Match decisions: daily matches now support persisted `accepted`/`passed`
  decisions through `/api/members/blind-date/decision`; the swipe experience
  remains unchanged.
- Location discovery: the member directory now filters by timezone and shows
  privacy-preserving approximate country markers in a responsive map.
- Room presence: JaaS-connected room sessions heartbeat through
  `/api/rooms/[id]/presence`, powering member-directory live status and live
  viewer counts without trusting stale room events.
- Project portfolios: members can create, update status, feature, upload
  images for, and delete dedicated projects from `/portfolio`; active and
  completed projects appear on member profiles.
- Room safety: chat actions now mute/block members locally and report room
  messages into the existing moderation queue; blocked authors are filtered
  from room chat history and future loads.
- Migration `6_match_presence_projects` is applied to production.

## Phase 9 — Reliability, room chat gating & legal (September 2026)

- **Supabase client dedup**: a single shared browser client (`src/lib/supabase.js`,
  `persistSession:false`, `autoRefreshToken:false`) is re-exported by
  `src/lib/supabase/browser.js` and used by `chat-realtime`, `auth-client` and
  `client-auth`; `service.js` remains the server-only admin client. Kills the
  duplicate `GoTrueClient` warning. Only two `createClient()` calls remain.
- **Chat mobile compaction**: `--topbar-h` CSS var (60px → 48px ≤480px) plus
  compacted header/rail/composer/search at mobile widths; desktop untouched;
  touch targets kept ≥40px.
- **Room event FK fix**: `mapRoomRow` adds `persisted`; canonical rooms are
  `persisted:false`; `getRoomBySlugEnsuringAlwaysOn` treats only persisted rooms
  as present and seeds on demand; the Jitsi token route guards
  `roomEvent.create` behind `room.persisted` (kills the
  `RoomEvent_roomId_fkey` join error).
- **Lounge seeding fix ("Failed to load chat")**: `seedAlwaysOnRooms` now uses a
  real owner/moderator `createdBy` and `null` group/space FKs (the old
  `createdBy:"system"` / `""` values failed FK constraints, so `Room` stayed
  empty); `listRoomsEnsuringAlwaysOn` counts only persisted rooms; new
  `getActiveRoomEnsuring(roomKey)` seeds canonical lounges on demand and is used
  by room chat/signals resolvers. All four lounges (Happy Hour Hub, Lo-Fi &
  Loops, Velvet Den, Silent Studio) are seeded in production; room chat read +
  send verified.
- **Room chat membership gating**: single authorization choke point
  (`requireRoomAccess` / `resolveRoomAccess` in `src/lib/server/room-access.js`)
  wired into every room-chat surface (messages, signals, presence, reactions,
  pins, deletes) and the room page. Always-on lounges stay public to active
  members; staff (owner/moderator) and room host/co-host bypass; any other room
  requires Space, then Group membership; every denial collapses to `404`
  "Room not found" so private rooms cannot be probed. (Jitsi's own in-call chat
  is unrelated and runs entirely on Jitsi's servers.)
- **Room chat text color**: `.chatBubble` got an explicit near-black
  `color:#252329` so sent and received messages are readable on the white
  bubble (they previously inherited the shell's white); the transient
  "sending…" bubble keeps white-on-magenta.
- **Terms of Service placement**: `/terms` rewritten with the approved document
  (No Self-Promotion / Zero-Tolerance / Moving-In Host Responsibilities /
  Lifetime Ban / Platform Rights); the signup checkbox label now wraps the words
  "Terms of Service" in the `/terms` link (en/de/fr) — the bare `{terms}` tag
  previously rendered an empty anchor ("the of Service"); the Welcome Vault
  pinned feed post mirrors the full Terms and self-updates existing posts when
  the copy changes; a login/signup legal footer was added then removed per
  product direction (final state: no footer bar — Terms stays linked from the
  signup checkbox and the Welcome Vault).

## Housekeeping

- Logged-in/meetings review on the marketing page (`secretyarnery.com/pages/speakeasy`)
  vs. the app found the feature set implemented (lounges, presence, matchmaker,
  daily blind date, neighborhoods, mute/block, moderation, portfolio, room
  music); branded neighborhood names and messaging live on the Shopify page.
