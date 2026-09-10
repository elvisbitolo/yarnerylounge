# Jitsi Room Loading Issue

## Status

Investigation and implementation in progress.

## Problem

Video rooms at `/rooms/[slug]` are not loading reliably in production. Users see:

> This room isn't available right now. Please try again.

The room join flow has two related failure points:

1. `POST /api/jitsi/token` can return `503 Service Unavailable`.
2. The Jitsi Meet External API may not be available when the room component initializes.

## Required fixes

### Backend token route

- Inspect the Next.js route at `src/app/api/jitsi/token/route.js`.
- Confirm the route runs in the Node.js runtime and is dynamically evaluated.
- Validate the JaaS configuration without exposing secrets:
  - `JITSI_APP_ID`
  - `JITSI_API_KEY_ID`
  - `JITSI_PRIVATE_KEY`
  - `JITSI_DOMAIN`
- Normalize escaped newlines in the private key.
- Return a clear, safe configuration error when JaaS is not configured.
- Preserve authorization, room membership, host rights, rate limiting, and publish permissions.
- Log only safe diagnostic metadata on the server.

### Frontend Jitsi loading

- Load the Jitsi External API with Next.js `Script`.
- Use `strategy="beforeInteractive"` from the root app layout.
- Use the configured JaaS domain and app-specific script path when available.
- Keep the room-side Jitsi SDK client-only so server rendering does not access browser globals.

### Room error handling

- Keep the user-facing error understandable.
- Log the HTTP status, API error code, and safe failure reason to the browser console.
- Add a retry action that requests a fresh token.
- Reset stale token state after a failed request.
- Distinguish JaaS configuration failures from unavailable rooms where possible.

## Verification

- Run the test suite.
- Run TypeScript checking.
- Run targeted linting for the changed room, layout, and API files.
- Confirm unauthenticated requests return the expected authorization response rather than an infrastructure error.
- Confirm an authenticated member can enter an active room and receive a valid JaaS token.
- Confirm retrying after a transient token failure works without refreshing the page.

## Related production issue

The earlier production logs also showed a missing `Room.imageUrl` database column during room lookup. That schema mismatch was addressed separately with the additive migration at:

`prisma/migrations/8_room_image_url/migration.sql`

The room token flow must still be verified from an authenticated production session after deployment.
