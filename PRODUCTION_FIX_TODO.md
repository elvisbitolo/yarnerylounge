# Secret Yarnery Production Fix Todo

## Current incident fixes

- [x] Restore room lookup by adding the missing `Room.imageUrl` database migration.
- [x] Regenerate Prisma Client so conversation pin fields are available to production routes.
- [x] Ensure Jitsi loads client-side before the room iframe is created.
- [x] Make the Add Availability control reliably open its modal.
- [x] Make the theme control visibly switch between dark and light appearance and persist the choice.
- [x] Improve mobile search with a focused input, dialog semantics, Escape handling, and an accurate close label.
- [x] Deploy the verified revision to the linked Vercel production project.
- [ ] Confirm fresh production room requests complete successfully after deployment.
- [ ] Confirm fresh pinned-message requests complete successfully after deployment.

## Professional Clusters member filter

- [ ] Ask before implementation: build all four clusters now, or phase the currently available data first?
- [ ] Activity & Mastery: XP tier, streaks, and quiz rank/certification.
- [ ] Creative Contribution: active project type and gallery/project status.
- [ ] Social & Role: role type and neighbourhood membership.
- [ ] Logistics: online now, timezone, country, and city.
- [ ] Add category accordions, accessible labels, compact controls, and result-state handling.
- [ ] Add project thumbnails, project-affinity matching, mentor badges, and active-timezone visibility only after their data sources are confirmed.

## Follow-up product scope

- [ ] Give each neighbourhood a private chat room and event calendar.
- [ ] Add a Dashboard “Trending Now” section using Gallery and Leaderboard data.
- [ ] Add a Crochet Along progress tracker and Dashboard check-in action.
- [ ] Reward successful referrals with XP and Guest Book badges.
- [ ] Surface a Question of the Day in the Front Parlor using the Admin Questions module.

## Verification gates

- [x] `npm test`
- [x] `npx tsc --noEmit`
- [x] Targeted ESLint has no errors.
- [x] Production deployment reports `READY`.
- [x] Production migration status reports the database is up to date.
- [x] No recurring 500/503 entries observed in the new deployment's recent production logs.
- [x] Unauthenticated production smoke check returns expected `401` for both Jitsi token and pinned-message endpoints.
- [ ] Validate the room and pinned-message flows from an authenticated production session.
