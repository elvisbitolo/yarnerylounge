# Secret Yarnery mobile application architecture

Status: discovery / implementation planning  
Target: Android first; keep iOS compatibility  
Production impact: none. This document does not change application runtime behaviour.

## Verified repository baseline

- Next.js 16.3.0, React 19.2.8, Node.js 24.x, npm.
- The application is a server-rendered Next.js application. Its root layout reads cookies, resolves the current member on the server, reads member role and unread notification count from Prisma, and renders the authenticated shell.
- The existing web app is hosted at https://christasspeakeasy.com.
- `public/manifest.webmanifest` and `public/sw.js` exist. The manifest currently identifies the product as "Yarnery Lounge", while the application metadata identifies it as "Secret Yarnery".
- `src/components/PushSetup.js` implements browser push subscription setup.
- Authentication uses the `community-auth` HTTP-only cookie and a server-side PostgreSQL session. The session exchange endpoint performs same-origin validation.
- Live rooms use the Jitsi React SDK and existing JaaS integration.
- No Capacitor config or Android native project was found in the inspected paths.

## Architecture decision

Do not attempt to statically export the Next.js application. The current app depends on server-side rendering, cookies, server authentication, Prisma, and runtime API routes. A static export would not preserve those behaviours.

The first Android proof of concept should retain the existing HTTPS application origin and backend. This is important because the current cookie/session and same-origin protections are designed around the website origin. The native container must not introduce a second authentication authority or weaken origin validation.

Before committing to a remote-origin WebView implementation, verify Capacitor's production deployment requirements and Android WebView behaviour against the current Capacitor version. Do not treat the development-only live-reload URL option as a production configuration without validating the official guidance.

## Non-negotiable compatibility requirements

1. Existing browser website login, OAuth, logout, refresh and session expiry continue to work unchanged.
2. Android login uses the existing secure session model; no tokens or service-role secrets are embedded in the app bundle.
3. Browser push subscriptions and delivery remain operational. Native push is an additional channel, with server-side deduplication and preference handling.
4. Lounge join events are based on the actual Jitsi conference-joined event, not merely WebView/network connection.
5. Camera, microphone, Bluetooth/audio routing, camera switching, app lifecycle, permission denial, reconnect and recording flows are tested on physical Android devices.
6. Payments, account management, media upload, deep links, external links and file downloads are tested before release.
7. All server/database changes are backward-compatible and independently deployable. No production schema migration is part of the initial native shell.

## Proposed phases and gates

### Phase 0 — local toolchain and reproducibility
- Confirm Node 24.x and npm versions.
- Install from the committed lockfile using `npm ci`.
- Run lint, unit tests and production build before changes.
- Record baseline failures separately from regressions.
- Confirm Android Studio, Android SDK, Java/JDK and a physical-device or emulator target.

Gate: clean baseline or documented pre-existing failures.

### Phase 1 — Capacitor dependency and native shell
- Select and pin mutually compatible Capacitor core, CLI, Android and required plugin versions.
- Update package manifest and regenerate the npm lockfile with npm; never hand-edit the lockfile.
- Add a JavaScript Capacitor configuration only after confirming the application-origin strategy.
- Generate the Android project using the official Capacitor CLI.
- Keep all native project changes on this feature branch.

Gate: reproducible Android debug build; no production deployment.

### Phase 2 — identity and session compatibility
- Verify cookie persistence across app restarts.
- Verify same-origin session exchange, OAuth return, logout and expired sessions.
- Verify external navigation cannot impersonate the trusted app origin.
- Add only narrowly scoped native bridge behaviour if a real test demonstrates it is needed.

Gate: auth regression suite passes on web and Android.

### Phase 3 — native notifications
- Keep existing VAPID/browser push code intact.
- Add Android native token registration and server delivery only after selecting the push provider and confirming account/project ownership and configuration.
- Ensure one logical event does not produce duplicate browser and native alerts.

Gate: permission granted/denied, token refresh, logout, preference changes and deduplication tested.

### Phase 4 — Jitsi and device lifecycle
- Test camera/microphone permissions, front/rear camera, audio route, Bluetooth, incoming interruptions, background/foreground, network loss/recovery, room exit and recording.
- Verify room-presence and lounge-entry notifications remain tied to actual conference join.

Gate: repeated physical-device lounge tests pass.

### Phase 5 — release readiness
- Test all critical member journeys and deep links.
- Configure signing securely outside the repository; never commit keystores or credentials.
- Produce an internal APK/AAB and test it before any store submission.

Gate: owner approval of a release candidate.

## Current implementation boundary

This branch is intentionally not yet changing runtime code. The next implementation step requires a reproducible local npm/Android toolchain so that dependencies, lockfile, generated native project, lint, tests and Android build can all be verified. Do not merge this branch into production until those checks and the physical-device gates pass.
