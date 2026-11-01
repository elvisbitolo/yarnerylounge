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
- Manifest identity, scope, launch route, display mode and theme are explicit.
- Existing application routes, auth/session endpoints, VAPID web push and
  Supabase/Postgres data remain unchanged.
- Only icons whose maskable-safe-area treatment has been verified should be
  declared with `purpose: "maskable"`; a regular icon must not be relabelled.

## Free direct-APK route (no Play Console)

Run from a machine with Node.js, a supported JDK, Android SDK command-line
tools, and (for device installation) Android Platform Tools:

```bash
npx --yes @bubblewrap/cli init --manifest=https://christasspeakeasy.com/manifest.webmanifest
```

Use the stable application ID `com.secretyarnery.app`, the launch path
`/dashboard`, and the HTTPS origin `https://christasspeakeasy.com`.
Keep the generated signing keystore and passwords private and backed up in
secure storage. **Never commit the keystore, passwords, or signing secrets.**
The same signing key is required for all future APK updates; losing it means
users cannot install an update over the existing app.

Then build and install:

```bash
npx @bubblewrap/cli build
npx @bubblewrap/cli install
```

Bubblewrap generates a signed APK named `app-release-signed.apk`. That APK
can be distributed directly (for example, from a download page on the website)
without Play Console registration. Android users will need to approve the
browser's “install unknown apps” prompt. Updates must be signed with the same
private key and redistributed manually. Do not publish an AAB as though it
were directly installable; the APK is the sideload artifact.

## Digital Asset Links for verified full-screen mode

Direct distribution still needs domain association for the TWA to open without
browser UI. After generating the signing key:

1. Obtain its **APK signing certificate SHA-256 fingerprint** from the exact
   keystore used to sign the distributed APK.
2. Create `public/.well-known/assetlinks.json` with relation
   `delegate_permission/common.handle_all_urls`, namespace `android_app`,
   package name `com.secretyarnery.app`, and that exact fingerprint.
3. Deploy the file to
   `https://christasspeakeasy.com/.well-known/assetlinks.json`.
4. Validate the association and TWA launch before distributing the APK.

Do not publish a placeholder fingerprint. A mismatch makes Chrome fall back
to browser UI. If the signing key is ever rotated, the association must be
updated and the transition planned before users receive the new APK.

## Release validation

Before calling the app release-ready, test on physical Android devices:
sign-in, Google OAuth if enabled, logout, session expiry, browser push,
payments, downloads, Jitsi camera/microphone permissions, audio routing,
background/foreground transitions, deep links, reconnect and APK updates.
Run Bubblewrap PWA validation and Lighthouse checks. Validate Safari/iOS Add
to Home Screen and critical member journeys separately on a real iOS device.

## Safety boundary

No database migration, Supabase configuration change, auth-cookie relaxation,
service-role key, native push provider, production deploy, signing key or
Digital Asset Links assertion is part of the initial scaffold. Browser push
remains the existing VAPID implementation. Native push is a separate phase
requiring a provider/configuration decision and duplicate-delivery handling.
