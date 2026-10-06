// Terms of Service consent. Pure decision logic — no I/O, unit-testable, and
// the single place that decides whether a member may use the app yet.
//
// Option B: the account exists (so Supabase, sessions, email verification and
// the prepaid membership gate all behave exactly as before) but the member has
// no access until they explicitly accept. Two independent signals say "already
// covered", and either one is enough:
//
//   1. a recorded acceptance (tosAcceptedAt), which is what the /consent screen
//      writes going forward and what the migration back-fills for everyone who
//      existed before this shipped;
//   2. the account being older than TOS_CONSENT_SINCE — the belt to (1)'s
//      braces, so a member who predates the regime can never be locked out by a
//      missed row, a failed back-fill, or a deploy that ran the code before the
//      migration. Fails OPEN on purpose: a member wrongly let in is a
//      compliance footnote, a member wrongly locked out is an outage.

export const TOS_VERSION = "2026-10-06";

// Any account created strictly before this instant is grandfathered. Instant of
// the first release that ships the consent screen.
export const TOS_CONSENT_SINCE = Date.UTC(2026, 9, 6);

// Returns true when the member must be sent to /consent before doing anything
// else. Accepts the mapUserRow() doc shape (timestamps as epoch millis).
export function needsTosConsent(userDoc) {
  if (!userDoc) return false;
  if (userDoc.tosAcceptedAt) return false;
  const created = Number(userDoc.createdAt) || 0;
  if (created > 0 && created < TOS_CONSENT_SINCE) return false;
  return true;
}
