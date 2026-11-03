// Pure selection + copy for member re-engagement and first-week onboarding.
// Kept free of Prisma/fetch so timing rules and messages can be unit tested.

const DAY = 24 * 60 * 60 * 1000;

export const REENGAGEMENT_MIN_INACTIVE_DAYS = 2;
export const REENGAGEMENT_MIN_ACCOUNT_AGE_DAYS = 0;
export const REENGAGEMENT_REPEAT_DAYS = 7;
export const REENGAGEMENT_DAILY_LIMIT = 100;

function toMillis(value) {
  if (value == null) return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function readExtra(row) {
  return row?.extra && typeof row.extra === "object" ? row.extra : {};
}

export function isAutomationEmailOptOut(row) {
  if (row?.notifications === "off") return true;
  const prefs = row?.notificationPreferences;
  if (prefs && prefs.automations === false) return true;
  const extra = readExtra(row);
  return extra.emailPreferences?.weeklyDigest === false;
}

function latestSessionActivity(row) {
  const sessions = Array.isArray(row?.sessions) ? row.sessions : [];
  let latest = NaN;
  for (const session of sessions) {
    const seen = toMillis(session?.lastSeenAt);
    if (Number.isFinite(seen) && (!Number.isFinite(latest) || seen > latest)) latest = seen;
  }
  return latest;
}

export function selectReengagementCandidates(rows, options = {}) {
  const now = options.now ?? Date.now();
  const minInactiveMs = (options.minInactiveDays ?? REENGAGEMENT_MIN_INACTIVE_DAYS) * DAY;
  const minAccountMs = (options.minAccountAgeDays ?? REENGAGEMENT_MIN_ACCOUNT_AGE_DAYS) * DAY;
  const repeatMs = (options.repeatAfterDays ?? REENGAGEMENT_REPEAT_DAYS) * DAY;
  const limit = options.limit ?? REENGAGEMENT_DAILY_LIMIT;
  const out = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.suspended || isAutomationEmailOptOut(row)) continue;

    const createdMs = toMillis(row.createdAt);
    if (!Number.isFinite(createdMs) || now - createdMs < minAccountMs) continue;

    const extra = readExtra(row);
    const extraActivity = toMillis(extra.lastActiveAt);
    const sessionActivity = latestSessionActivity(row);
    const activityMs = Math.max(
      Number.isFinite(extraActivity) ? extraActivity : -Infinity,
      Number.isFinite(sessionActivity) ? sessionActivity : -Infinity
    );
    // Accounts with no session/activity record are treated as never-activated:
    // their account creation time is the safest available reference.
    const referenceMs = Number.isFinite(activityMs) ? activityMs : createdMs;
    if (now - referenceMs < minInactiveMs) continue;

    const lastSentMs = toMillis(extra.reengagementSentAt);
    if (Number.isFinite(lastSentMs) && now - lastSentMs < repeatMs) continue;

    out.push({ ...row, reengagementKind: row.sessions?.length ? "returning" : "onboarding" });
    if (out.length >= limit) break;
  }
  return out;
}
