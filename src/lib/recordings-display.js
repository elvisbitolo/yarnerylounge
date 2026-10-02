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

/** Locale-aware clock time ("14:05"), or null. */
export function formatRecordingTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Library label for a recording: "Happy Hour Hub · Sun, 12 Mar".
 * Omits the year when the session happened in the current one.
 */
export function defaultRecordingTitle({ roomName, startedAt, now = new Date() } = {}) {
  const base = String(roomName || "").trim() || "Lounge recording";
  const when = startedAt instanceof Date && !Number.isNaN(startedAt.getTime()) ? startedAt : now;
  const sameYear = when.getFullYear() === now.getFullYear();
  return `${base} · ${when.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })}`;
}

// How long a freshly captured recording wears the NEW badge.
export const RECORDING_NEW_WINDOW_MS = 48 * 60 * 60 * 1000;

/** True while a recording is inside the 48h "new" window. */
export function isNewRecording(iso, now = Date.now()) {
  if (!iso) return false;
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return false;
  const age = Number(now) - started;
  return age >= 0 && age <= RECORDING_NEW_WINDOW_MS;
}

/**
 * "landscape" (16:9) or "vertical" (9:16) from the intrinsic dimensions.
 * Unknown or square-ish dimensions fall back to landscape, which is the common
 * Jitsi gallery recording.
 */
export function recordingOrientation(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "landscape";
  return h > w ? "vertical" : "landscape";
}

// Longest side of a stored poster frame. 640px keeps a card crisp on a retina
// grid while staying well under the 512KB upload cap.
export const THUMBNAIL_MAX_EDGE = 640;

/** Scale intrinsic dimensions so the longest side is at most `maxEdge`. */
export function computeThumbnailSize(width, height, maxEdge = THUMBNAIL_MAX_EDGE) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const longest = Math.max(w, h);
  if (!(longest > 0)) return { width: maxEdge, height: Math.round((maxEdge * 9) / 16) };
  const scale = Math.min(1, maxEdge / longest);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}
