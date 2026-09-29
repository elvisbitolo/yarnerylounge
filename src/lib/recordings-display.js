// Presentation helpers for the recordings library.
//
// Kept separate from recordings-core.js on purpose: that module imports
// node:crypto (webhook signature verification) and therefore cannot be pulled
// into a client bundle. These helpers have no imports at all, so both the
// server-rendered page and the browser player can share them.

/** Render a second count as "1:02:03" / "4:07". */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Render a byte count as "412 MB". Returns "" for an unknown size. */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const value = n / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** Locale-aware date, or null when the value is unusable. */
export function formatRecordingDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Library label for a recording: "Happy Hour Hub · 12 Mar".
 * Omit the year when the session happened in the current one.
 */
export function defaultRecordingTitle({ roomName, startedAt, now = new Date() } = {}) {
  const base = String(roomName || "").trim() || "Lounge recording";
  const when = startedAt instanceof Date && !Number.isNaN(startedAt.getTime()) ? startedAt : now;
  const sameYear = when.getFullYear() === now.getFullYear();
  return `${base} · ${when.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })}`;
}
