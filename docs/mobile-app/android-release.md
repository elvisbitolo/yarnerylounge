# Android app packaging (Trusted Web Activity)

This Android-first delivery uses a **Trusted Web Activity (TWA)** for the existing
PWA rather than embedding the Next.js server in a WebView.

## Why this implementation

The production app is server-rendered and relies on its existing HTTPS origin,
HTTP-only `community-auth` session cookie, Prisma-backed API routes and Jitsi.
A TWA opens the verified website in the user's browser engine on the same origin.
It avoids a second mobile authentication system, a static export, and a
production WebView configured with Capacitor's development-only `server.url`.

The existing website remains the source of truth. iOS continues to use the
same responsive PWA in Safari / Add to Home Screen; no iOS-specific auth or
database is introduced.

## Implemented web-app prerequisites

- The web manifest uses the product's canonical **Secret Yarnery** name.
- Manifest identity, scope, launch route, display mode, theme and icons are
  explicitly declared.
- Existing application routes, auth/session endpoints, VAPID web push and
  Supabase/Postgres data remain unchanged.

## Generate the Android project

Run from the repository root on a machine with Node.js 24, a supported JDK,
Android SDK command-line tools, and an Android device/emulator:

```bash
npx --yes @bubblewrap/cli init --manifest=https://christasspeakeasy.com/manifest.webmanifest
```

During initialization, use a stable reverse-DNS application ID owned by the
publisher (suggested: `com.secretyarnery.app`; confirm availability before
publishing), set the start URL to `/dashboard`, and retain the HTTPS origin
`https://christasspeakeasy.com`. Do not commit a generated signing keystore
or passwords.

Then build and install:

```bash
npx @bubblewrap/cli build
npx @bubblewrap/cli install
```

## Required before a verified full-screen release

1. Create the Play Console app and decide whether Play App Signing will be used.
2. Obtain the **app-signing** SHA-256 certificate fingerprint (not merely the
   upload-key fingerprint).
3. Publish `/.well-known/assetlinks.json` with the exact package ID and
   SHA-256 fingerprint. Do not publish a placeholder: a mismatch makes Chrome
   fall back to browser UI.
4. Verify origin association, install from an internal testing track, and test
   sign-in, Google OAuth, logout, session expiry, web push, payments, downloads,
   Jitsi camera/microphone, audio routing, background/foreground and reconnect
   on physical Android devices.
5. Run Lighthouse PWA checks and verify offline/error handling for all
   TWA launch-critical routes.
6. Validate Safari/iOS Add to Home Screen and all critical member journeys on
   real iOS devices separately.

## Safety boundary

No database migration, Supabase configuration change, auth-cookie relaxation,
service-role key, native push provider, production deploy, signing key or
Digital Asset Links assertion is part of this scaffold. Browser push remains
the existing VAPID implementation. Native push is a separate phase requiring
a provider/configuration decision and duplicate-delivery handling.
