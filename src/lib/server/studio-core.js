// Pure helpers for the Studio video library.
//
// The Studio stores its catalogue as a JSON manifest inside the existing
// private `recordings` Storage bucket (no new Prisma model, so no schema
// change): member-visible videos uploaded by a small allowlist of admins, each
// with a poster/cover image. Everything here is side-effect free so it can be
// unit tested without Supabase.

export const STUDIO_BUCKET = "recordings";
export const STUDIO_MANIFEST_PATH = "studio/manifest.json";
export const STUDIO_MANIFEST_VERSION = 1;

// The two accounts allowed to publish to the Studio. Overridable per
// deployment with STUDIO_ADMIN_EMAILS (comma/space separated). An empty or
// unparseable value falls back to these rather than locking everyone out.
export const DEFAULT_STUDIO_ADMIN_EMAILS = [
  "secretyarnery@gmail.com",
  "elvisbitolo11@gmail.com",
];

export const STUDIO_VIDEO_MIME_TYPES = ["video/mp4", "video/webm"];
export const STUDIO_POSTER_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

// App-level guard. The effective ceiling is still the project's global Storage
// file-size limit (see recordings.js); this keeps a pathological upload from
// even being prepared. Raise on a Pro/Team plan with STUDIO_MAX_VIDEO_BYTES.
const configuredMaxVideoBytes = Number(process.env.STUDIO_MAX_VIDEO_BYTES);
export const STUDIO_MAX_VIDEO_BYTES =
  Number.isFinite(configuredMaxVideoBytes) && configuredMaxVideoBytes > 0
    ? configuredMaxVideoBytes
    : 2 * 1024 ** 3;
export const STUDIO_MAX_POSTER_BYTES = 5 * 1024 ** 2;

const TITLE_MAX = 140;
const DESCRIPTION_MAX = 2000;
const NAME_MAX = 120;
const EMAIL_MAX = 200;
const DIMENSION_MAX = 8192;
// A Studio video is a published clip, not an all-day lounge session.
const DURATION_MAX_SEC = 12 * 60 * 60;

/** Split a STUDIO_ADMIN_EMAILS value into a normalized allowlist. */
export function parseStudioAdminEmails(raw) {
  const list = String(raw || "")
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : [...DEFAULT_STUDIO_ADMIN_EMAILS];
}

/** Case-insensitive allowlist check. A missing email is never an admin. */
export function isStudioAdminEmail(email, allowlist = DEFAULT_STUDIO_ADMIN_EMAILS) {
  if (!email) return false;
  const wanted = String(email).trim().toLowerCase();
  return (allowlist || []).some((allowed) => String(allowed).trim().toLowerCase() === wanted);
}

/** Strip anything that could traverse out of the bucket or break a key. */
export function safeStudioId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

export function studioVideoExtension(mime) {
  return String(mime || "").toLowerCase() === "video/webm" ? "webm" : "mp4";
}

export function studioPosterExtension(mime) {
  const value = String(mime || "").toLowerCase();
  if (value === "image/png") return "png";
  if (value === "image/webp") return "webp";
  return "jpg";
}

export function buildStudioVideoPath(id, mime) {
  const safe = safeStudioId(id);
  if (!safe) return null;
  return `studio/videos/${safe}/video.${studioVideoExtension(mime)}`;
}

export function buildStudioPosterPath(id, mime) {
  const safe = safeStudioId(id);
  if (!safe) return null;
  return `studio/videos/${safe}/poster.${studioPosterExtension(mime)}`;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function cleanBody(value) {
  return typeof value === "string" ? value.trim().slice(0, DESCRIPTION_MAX) : "";
}

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), min), max);
}

function clampBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function isoOrNull(value) {
  if (!value) return null;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

/** Coerce a stored manifest row into the canonical shape, or null if unusable. */
export function normalizeStudioVideo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = safeStudioId(raw.id);
  const videoPath = typeof raw.videoPath === "string" ? raw.videoPath.trim() : "";
  if (!id || !videoPath) return null;
  return {
    id,
    title: cleanText(raw.title).slice(0, TITLE_MAX) || "Studio video",
    description: cleanBody(raw.description),
    videoPath,
    posterPath: typeof raw.posterPath === "string" ? raw.posterPath.trim() : "",
    mimeType: STUDIO_VIDEO_MIME_TYPES.includes(raw.mimeType) ? raw.mimeType : "video/mp4",
    sizeBytes: clampBytes(raw.sizeBytes),
    durationSec: clampInt(raw.durationSec, 0, DURATION_MAX_SEC),
    width: clampInt(raw.width, 1, DIMENSION_MAX),
    height: clampInt(raw.height, 1, DIMENSION_MAX),
    createdBy: cleanText(raw.createdBy).slice(0, NAME_MAX),
    createdByEmail: cleanText(raw.createdByEmail).slice(0, EMAIL_MAX),
    createdAt: isoOrNull(raw.createdAt),
  };
}

/** Parse a manifest string/object into a valid, newest-first list. */
export function parseStudioManifest(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(parsed?.videos) ? parsed.videos : [];
  return sortStudioVideos(list.map(normalizeStudioVideo).filter(Boolean));
}

export function serializeStudioManifest(videos) {
  const rows = (videos || []).map(normalizeStudioVideo).filter(Boolean);
  return JSON.stringify({ version: STUDIO_MANIFEST_VERSION, videos: rows }, null, 2);
}

/** Newest first; entries without a timestamp sort last, never first. */
export function sortStudioVideos(videos) {
  return [...(videos || [])].sort((a, b) => {
    const left = a?.createdAt || "";
    const right = b?.createdAt || "";
    if (left === right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return right.localeCompare(left);
  });
}

/** Shape handed to the client: catalog fields plus a signed poster URL. */
export function serializeStudioVideo(video, posterUrl = null) {
  if (!video) return null;
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    durationSec: video.durationSec,
    width: video.width,
    height: video.height,
    createdBy: video.createdBy,
    createdAt: video.createdAt,
    posterUrl,
  };
}
