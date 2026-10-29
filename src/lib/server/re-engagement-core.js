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

const escapeHtml = (str) =>
  String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function buildReengagementEmail({ name, appUrl, nextEvent } = {}) {
  const base = String(appUrl || "").replace(/\/+$/, "");
  const feedUrl = base ? `${base}/feed` : "";
  const who = String(name || "").trim() || "there";
  const textLines = [
    `Hi ${who},`, "",
    "It's been a little while since we saw you in the Lounge, and the circle has been busy.", "",
    "Here's what's waiting for you:",
    "  - Catch up with everyone on the community feed",
    "  - Drop into a live lounge and say hello",
    "  - See what's coming up on the calendar",
  ];
  if (nextEvent?.title) textLines.push("", `Next up: ${nextEvent.title}${nextEvent.date ? ` (${nextEvent.date})` : ""}.`);
  textLines.push("", "Come say hello — the needles are out and the kettle's on.", feedUrl, "",
    "— The Secret Yarnery Team", "",
    "You're receiving this because you're a member. Turn reminder emails off under Account > Notifications.");
  const text = textLines.join("\n");
  const eventRow = nextEvent?.title
    ? `<p style="margin:16px 0 0;color:#555;font-size:14px;"><strong style="color:#333;">Next up:</strong> ${escapeHtml(nextEvent.title)}${nextEvent.date ? ` <span style="color:#7c3aed;">${escapeHtml(nextEvent.date)}</span>` : ""}</p>`
    : "";
  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="background:linear-gradient(135deg,#e91e63,#7c3aed);padding:32px 24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;font-size:22px;margin:0;">We missed you, ${escapeHtml(who)}</h1>
        <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:8px 0 0;">A quiet hello from everyone in the Lounge</p>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none;">
        <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">It's been a little while since we saw you, and the circle has been busy — new projects on the feed, live lounges, and events on the calendar. We'd love to have you back.</p>
        <ul style="color:#555;font-size:14px;line-height:1.9;margin:0;padding-left:18px;"><li>Catch up with everyone on the community feed</li><li>Drop into a live lounge and say hello</li><li>See what's coming up on the calendar</li></ul>
        ${eventRow}
        <div style="padding:24px 0 8px;text-align:center;"><a href="${feedUrl}" style="display:inline-block;background:#e91e63;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 26px;border-radius:999px;">Come back to the Lounge</a></div>
        <p style="color:#999;font-size:12px;line-height:1.5;margin:8px 0 0;text-align:center;">Come say hello — the needles are out and the kettle's on.<br />You're receiving this because you're a member. Turn reminder emails off under <a href="${base}/account/notifications" style="color:#7c3aed;">Account &gt; Notifications</a>.</p>
      </div>
    </div>`;
  return { subject: "We missed you at the Lounge", text, html };
}

export function buildWelcomeBackEmail({ name, appUrl } = {}) {
  const base = String(appUrl || "").replace(/\/+$/, "");
  const url = base ? `${base}/feed` : "/feed";
  const who = String(name || "").trim() || "there";
  const subject = "Your first visit to Secret Yarnery is waiting";
  const text = `Hi ${who},\n\nWelcome to Secret Yarnery. Your community is ready when you are. Start by introducing yourself, exploring member projects, or joining a conversation.\n\nStart here: ${url}\n\nYou can manage reminder emails under Account > Notifications.\n— The Secret Yarnery Team`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#171717;"><h1>Welcome to Secret Yarnery, ${escapeHtml(who)}</h1><p>Your community is ready when you are. Start by introducing yourself, exploring member projects, or joining a conversation.</p><p><a href="${url}" style="display:inline-block;background:#f6077a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">Explore the community</a></p><p style="font-size:12px;color:#777;">Manage reminder emails under Account &gt; Notifications.</p></div>`;
  return { subject, text, html };
}
