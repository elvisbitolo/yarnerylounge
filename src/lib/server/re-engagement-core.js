// Pure selection + copy for the "we miss you" re-engagement reminder. Kept
// free of Prisma/fetch so the timing rules and message can be unit tested.

const DAY = 24 * 60 * 60 * 1000;

// Nudge members after two days without a visit, including members who created
// an account but never made it into the community. Repeat at most weekly so
// reminders stay useful rather than becoming daily spam.
export const REENGAGEMENT_MIN_INACTIVE_DAYS = 2;
export const REENGAGEMENT_MIN_ACCOUNT_AGE_DAYS = 0;
export const REENGAGEMENT_REPEAT_DAYS = 7;

// Cap per run so the sequential Resend calls stay inside the cron's 60s budget.
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

// Automation/digest emails share one opt-out: the "automations" notification
// toggle, with the legacy extra.emailPreferences.weeklyDigest flag honoured so
// members who set it before the toggle existed are not re-subscribed.
export function isAutomationEmailOptOut(row) {
  const prefs = row?.notificationPreferences;
  if (prefs && prefs.automations === false) return true;
  const extra = readExtra(row);
  if (extra.emailPreferences && extra.emailPreferences.weeklyDigest === false) return true;
  return false;
}

// rows: Prisma User rows ({ id, name, email, suspended, notificationPreferences,
// extra, createdAt }). Returns the members to email this run, newest-inactive
// first is not needed; the order is the caller's and the cap is applied here.
export function selectReengagementCandidates(rows, options = {}) {
  const now = options.now ?? Date.now();
  const minInactiveMs = (options.minInactiveDays ?? REENGAGEMENT_MIN_INACTIVE_DAYS) * DAY;
  const minAccountMs = (options.minAccountAgeDays ?? REENGAGEMENT_MIN_ACCOUNT_AGE_DAYS) * DAY;
  const repeatMs = (options.repeatAfterDays ?? REENGAGEMENT_REPEAT_DAYS) * DAY;
  const limit = options.limit ?? REENGAGEMENT_DAILY_LIMIT;

  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    if (row.suspended) continue;
    if (isAutomationEmailOptOut(row)) continue;

    const createdMs = toMillis(row.createdAt);
    if (!Number.isFinite(createdMs) || now - createdMs < minAccountMs) continue;

    const extra = readExtra(row);
    const lastActiveMs = toMillis(extra.lastActiveAt);
    const reference = Number.isFinite(lastActiveMs) ? lastActiveMs : createdMs;
    if (now - reference < minInactiveMs) continue;

    const lastSentMs = toMillis(extra.reengagementSentAt);
    if (Number.isFinite(lastSentMs) && now - lastSentMs < repeatMs) continue;

    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

const escapeHtml = (str) =>
  String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export function buildReengagementEmail({ name, appUrl, nextEvent } = {}) {
  const base = String(appUrl || "").replace(/\/+$/, "");
  const feedUrl = base ? `${base}/feed` : "";
  const who = String(name || "").trim() || "there";

  const textLines = [
    `Hi ${who},`,
    "",
    "It's been a little while since we saw you in the Lounge, and the circle has been busy.",
    "",
    "Here's what's waiting for you:",
    "  - Catch up with everyone on the community feed",
    "  - Drop into a live lounge and say hello",
    "  - See what's coming up on the calendar",
  ];
  if (nextEvent && nextEvent.title) {
    textLines.push("", `Next up: ${nextEvent.title}${nextEvent.date ? ` (${nextEvent.date})` : ""}.`);
  }
  textLines.push(
    "",
    "Come say hello — the needles are out and the kettle's on.",
    feedUrl,
    "",
    "— The Secret Yarnery Team",
    "",
    "You're receiving this because you're a member. Turn reminder emails off under Account > Notifications."
  );
  const text = textLines.join("\n");

  const eventRow = nextEvent && nextEvent.title
    ? `<p style="margin:16px 0 0;color:#555;font-size:14px;">
          <strong style="color:#333;">Next up:</strong> ${escapeHtml(nextEvent.title)}${nextEvent.date ? ` <span style="color:#7c3aed;">${escapeHtml(nextEvent.date)}</span>` : ""}
        </p>`
    : "";

  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="background:linear-gradient(135deg,#e91e63,#7c3aed);padding:32px 24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;font-size:22px;margin:0;">We missed you, ${escapeHtml(who)}</h1>
        <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:8px 0 0;">A quiet hello from everyone in the Lounge</p>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none;">
        <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
          It's been a little while since we saw you, and the circle has been busy — new projects on the feed,
          live lounges, and events on the calendar. We'd love to have you back.
        </p>
        <ul style="color:#555;font-size:14px;line-height:1.9;margin:0;padding-left:18px;">
          <li>Catch up with everyone on the community feed</li>
          <li>Drop into a live lounge and say hello</li>
          <li>See what's coming up on the calendar</li>
        </ul>
        ${eventRow}
        <div style="padding:24px 0 8px;text-align:center;">
          <a href="${base}/feed" style="display:inline-block;background:#e91e63;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 26px;border-radius:999px;">Come back to the Lounge</a>
        </div>
        <p style="color:#999;font-size:12px;line-height:1.5;margin:8px 0 0;text-align:center;">
          Come say hello — the needles are out and the kettle's on.<br />
          You're receiving this because you're a member. Turn reminder emails off under
          <a href="${base}/account/notifications" style="color:#7c3aed;">Account &gt; Notifications</a>.
        </p>
      </div>
    </div>`;

  return { subject: "We missed you at the Lounge", text, html };
}
