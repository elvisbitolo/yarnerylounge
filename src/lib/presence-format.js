// Human-friendly "last seen" wording for presence. Browser-safe and
// timezone-independent: the input is the ISO stamp stored on the user's
// presence heartbeat, and everything is derived from epoch millis.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function toMillis(value) {
  if (typeof value === "number") return value;
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : NaN;
}

// "" when there is no usable stamp, otherwise "just now", "5 minutes ago",
// "3 hours ago", "yesterday", "4 days ago" or a short date.
export function formatLastSeen(lastActiveAt, now = Date.now()) {
  const ts = toMillis(lastActiveAt);
  if (!Number.isFinite(ts)) return "";
  const diff = now - ts;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  }
  if (diff < DAY) {
    const hrs = Math.floor(diff / HOUR);
    return `${hrs} ${hrs === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(diff / DAY);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ts));
}
