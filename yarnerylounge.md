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

## Phase 10 — Calendar, groups & chat (PRD pass)

Shipped as separate commits, each verified with `npm test` / `npm run lint`
(0 errors; pre-existing `<img>`/`location.assign` warnings only) / `npm run build`.

- **Calendar**
  - Phase 1 (`a8260f3`, `0a8032c`): waking-hours window (08:00–19:00), now-line
    + pip, today accent, sticky time column/day heads, bounded scroll;
    timezone chip persisted in `localStorage` (`yarnery-calendar-timezone`).
  - Phase 2 (`3dcf20e`): merges `/api/events` + `/api/availability` into one
    grid with type colours, legend/filter chips, weekend shading and
    overlap lanes via `layoutOverlaps()` in `src/lib/calendar-core.js`.
  - Phase 3 (`fd9e04a`): up-next card, event details, reminders
    (`localStorage` key `yarnery-calendar-reminders` + 15-min notification)
    and RFC 5545 `.ics` export via `src/lib/ics-core.js`.
  - Phase 4 (`ae1052a`): mobile agenda list (<768px), “Matches me” filter and
    Escape-to-close `role="dialog" aria-modal="true"` details panel.
- **Groups** (`a67cf97`, `2408a74`): dark detail theme, real Joined state in
  `GroupJoinButton`, “Next hangout” card via `nextEventForRoom()` in
  `src/lib/server/events.js`, and a hero fallback banner + member avatar stack
  when a neighbourhood has no cover image.
- **Chat**
  - Phase 2a (`8db43d6`): hover/focus message actions (always visible on
    touch), single/double delivery ticks, icon-expand search and an
    All/Unread filter in the conversation rail.
  - Phase 2b (`5b264ac`): “Live now” presence strip backed by
    `GET /api/presence?online=1` + `src/lib/server/presence-core.js`
    (10 node tests), and a rounded-tail bubble restyle.
  - PRD Phase 1 (`1cfbd29`): content-fit bubbles (max 70%), connection grouping,
    centred date pills, in-bubble time + 3-state ticks, long-press actions,
    per-conversation typing (header subtitle + animated thread bubble) via
    `src/lib/chat-typing-core.js`, and expanded header + inline search.
  - PRD Phase 2 (`5948c0b`): inbox filter chips (All/Unread/Lounges/Groups),
    unread count badges, own-last-message ticks, enriched `listConversations`
    (title/photoURL/lastSenderId/unreadCount), and a compact “Live now” lounge
    strip from `GET /api/rooms/live` with per-room viewer counts.
  - PRD Phase 3 (`0f4bed8`): in-lounge presence — `activeRoomsForUsers()` in
    `src/lib/server/room-presence.js`, `room` on `GET /api/presence?ids=` and an
    “In <Lounge>” join link in `PresenceStatus`; removed dead call buttons.
  - Voice notes (`d860fa4`): `MediaRecorder` capture with live timer, waveform
    peaks computed via `decodeAudioData`, an inline play/seek `VoiceNote`
    player, audio attachment validation in the messages route, and `kind:
    "audio"` persistence (duration + peaks) in `addMessage`.
  - Scroll-to-latest jump button with an unread-count chip, and a typing-privacy
    toggle (eye button in the rail) persisted under `yarnery-typing-hidden`.

## Phase 11 — Recordings library (PRD pass)

- **Phase 1** (`db5e1a8`): poster frames, duration badges, a 4/2/1 responsive
  card grid, title cleanup, a 48h NEW badge, vertical (9:16) framing and a live
  “This session is being recorded” consent indicator.
  - **Schema** — migration `19_recording_media_meta` adds `thumbnailPath`,
    `width`, `height`, `deletedAt`, `deletedBy` (+ index) to `Recording`.
    Applied to Supabase alongside the long-pending
    `11_add_conversation_message_reactions` (fixes chat reactions, which were
    failing on a missing column) and `12_ephemeral_typing` (drops the dead
    `Typing` table now that typing uses Realtime Broadcast). `db:status` clean.
  - **Thumbnails** — captured in the browser: there is no ffmpeg on the
    serverless runtime. `src/lib/recording-thumbnail.js` seeks a signed video
    ~3s in, draws a 640px-longest-side JPEG to a canvas, and POSTs it to
    `/api/recordings/[id]/thumbnail`; `saveThumbnail` stores it once
    (idempotent) beside the video and records the intrinsic dimensions. Frames
    load lazily via `IntersectionObserver`, so only visible cards pay to decode
    a video, and `page.js` signs every frame in one Storage call
    (`signThumbnailUrls`). Magic-byte/size validation lives in
    `parseThumbnailDataUrl`.
  - **Grid** — `RecordingsLibrary.js` + `recordings.module.css`: thumbnail with
    play overlay, duration badge, NEW badge (last 48h), date+time/size meta
    (lounge hidden when the title already names it), a signed-URL player panel,
    and an empty state linking to the calendar.
  - **Consent** — `RoomClient` listens for Jitsi `recordingStatusChanged` and
    shows a header “Recording” chip and banner to every participant, plus a
    join-screen notice (PRD 4.7).
  - **Tests** — `recordings-display` + `recordings-core` cover `isNewRecording`,
    `recordingOrientation`, `computeThumbnailSize`, `buildThumbnailPath`,
    `clampDimension`, `parseThumbnailDataUrl` and the new serialized media
    fields. 584 pass / 0 fail; lint 0 errors; build OK.
- **Phase 2**: processing/failed cards, in-page player and Share.
  - **Pipeline** — `listRecordings({ includeUnready })` returns
    pending/processing/failed rows (newest-first, null dates last) and the
    library polls `GET /api/recordings?include=all` every 8s while anything is
    unready, so a card flips to playable without a reload. Non-ready cards show
    an indeterminate bar; failed cards offer Retry.
  - **Retry** — `POST /api/recordings/[id]/retry` (owner only) resets the row to
    `pending` via `retryRecording` (rejects an expired 24h JaaS link with 410)
    and re-runs `pullRecording` in `after()`; `maxDuration = 300`.
  - **Player** — `RecordingPlayer.js` adds a 0.75–2× speed select, resume
    position (`localStorage` key `yarnery-recording-pos:<id>`, skipped within 5s
    of the end), volume, full screen and keyboard controls (space, ←/→ ±5s,
    ↑/↓ volume, F). Vertical video fits whole (`object-fit: contain`).
  - **Share / download** — “Share” copies a members-only deep link
    `/recordings?rec=<id>`; opening that link auto-plays the recording. The play
    route now also returns a `downloadUrl` attachment for owners and moderators.
  - Lint 0 errors (28 warnings); build OK.

## Housekeeping

- Logged-in/meetings review on the marketing page (`secretyarnery.com/pages/speakeasy`)
  vs. the app found the feature set implemented (lounges, presence, matchmaker,
  daily blind date, neighborhoods, mute/block, moderation, portfolio, room
  music); branded neighborhood names and messaging live on the Shopify page.
