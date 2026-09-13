// Timezone-aware chat time helpers. All chat timestamps are stored as UTC
// (Postgres now()); these render every timestamp in the VIEWER's own locale
// and timezone, so a member in Nairobi and a member in Toronto each see the
// correct local time for the same UTC instant.

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function localDayDiff(ms, now) {
  return Math.round((startOfLocalDay(ms) - startOfLocalDay(now)) / DAY_MS);
}

export function isSameLocalDay(a, b) {
  return startOfLocalDay(a) === startOfLocalDay(b);
}

// "Today" / "Yesterday" / "Mon, Sep 14" — inserted between messages with
// different local calendar days.
export function dayDividerLabel(ms, now = Date.now()) {
  const diff = localDayDiff(ms, now);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

// Bubble timestamp — always the viewer's local time.
export function chatTimeLabel(ms) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

// Full bubble timestamp used inside reply/detail contexts.
export function chatFullTimeLabel(ms) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

// Conversation-list time: local clock today, "Yesterday", weekday within the
// last week, then the short date.
export function chatListTime(ms, now = Date.now()) {
  if (!ms) return "";
  const diff = localDayDiff(ms, now);
  if (diff === 0) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  }
  if (diff === -1) return "Yesterday";
  if (now - ms < 7 * DAY_MS) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(ms));
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}