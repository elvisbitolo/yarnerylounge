// Studio video library: storage + persistence.
//
// Members watch published clips at /community/studio; only an email allowlist
// (STUDIO_ADMIN_EMAILS, defaulting to the two founders) may publish or remove.
//
// Videos are large, so the browser uploads the bytes straight to Supabase
// Storage through short-lived signed upload URLs — the bytes never pass through
// a Vercel Function (which caps request bodies far below a real video). This
// module mints those URLs, then records the finished clip in a JSON manifest
// object in the same private `recordings` bucket. Reusing that bucket keeps the
// Studio schema-free, since prisma/schema.prisma must not change.

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/service";
import { logError } from "@/lib/server/log";
import { ensureRecordingsBucket } from "./recordings";
import {
  STUDIO_BUCKET,
  STUDIO_MANIFEST_PATH,
  STUDIO_MAX_POSTER_BYTES,
  STUDIO_MAX_VIDEO_BYTES,
  STUDIO_POSTER_MIME_TYPES,
  STUDIO_VIDEO_MIME_TYPES,
  buildStudioPosterPath,
  buildStudioVideoPath,
  isStudioAdminEmail,
  normalizeStudioVideo,
  parseStudioAdminEmails,
  parseStudioManifest,
  safeStudioId,
  serializeStudioManifest,
  sortStudioVideos,
} from "./studio-core";

// Playback/poster links are handed to member browsers; keep them short-lived.
const SIGNED_URL_TTL_SEC = 60 * 60 * 2;

/** The active uploader allowlist (env override, else the built-in two). */
export function studioAdminEmails() {
  return parseStudioAdminEmails(process.env.STUDIO_ADMIN_EMAILS);
}

/** May this identity publish to the Studio? */
export function isStudioAdmin(email) {
  return isStudioAdminEmail(email, studioAdminEmails());
}

function missingObjectError(error) {
  return /not.?found|does not exist|no such file/i.test(error?.message || "");
}

/**
 * Read the manifest, newest first. A missing object is the normal empty state
 * (no one has published yet), not an error worth surfacing.
 */
export async function listStudioVideos() {
  const { data, error } = await supabaseAdmin.storage
    .from(STUDIO_BUCKET)
    .download(STUDIO_MANIFEST_PATH);
  if (error) {
    if (!missingObjectError(error)) {
      logError("studio:manifest-read-failed", { message: error?.message });
    }
    return [];
  }
  let text = "";
  try {
    text = await data.text();
  } catch (readError) {
    logError("studio:manifest-body-failed", { message: readError?.message });
    return [];
  }
  return parseStudioManifest(text);
}

export async function getStudioVideo(id) {
  const safe = safeStudioId(id);
  if (!safe) return null;
  const videos = await listStudioVideos();
  return videos.find((video) => video.id === safe) || null;
}

async function saveStudioManifest(videos) {
  const bytes = new TextEncoder().encode(serializeStudioManifest(videos));
  const { error } = await supabaseAdmin.storage
    .from(STUDIO_BUCKET)
    .upload(STUDIO_MANIFEST_PATH, bytes, { contentType: "application/json", upsert: true });
  if (error) {
    logError("studio:manifest-write-failed", { message: error?.message });
    return { ok: false, error: "manifest_write_failed" };
  }
  return { ok: true };
}

/**
 * Validate an upload request and mint signed upload targets for the browser.
 * Returns { ok, id, videoPath, posterPath, videoUpload, posterUpload } where
 * each *Upload is { path, token } for supabase-js uploadToSignedUrl().
 */
export async function createStudioUploadTargets({ user, video, poster } = {}) {
  if (!isStudioAdmin(user?.email)) {
    return { ok: false, status: 403, error: "Only Studio admins can upload videos" };
  }

  const videoType = String(video?.type || "").toLowerCase();
  if (!STUDIO_VIDEO_MIME_TYPES.includes(videoType)) {
    return { ok: false, status: 400, error: "Upload an MP4 or WebM video" };
  }
  const videoSize = Number(video?.size);
  if (!Number.isFinite(videoSize) || videoSize <= 0) {
    return { ok: false, status: 400, error: "That video file is empty" };
  }
  if (videoSize > STUDIO_MAX_VIDEO_BYTES) {
    const gb = Math.round(STUDIO_MAX_VIDEO_BYTES / 1024 ** 3);
    return { ok: false, status: 400, error: `Video too large (max ${gb} GB)` };
  }

  const posterSize = Number(poster?.size);
  if (Number.isFinite(posterSize) && posterSize > STUDIO_MAX_POSTER_BYTES) {
    return { ok: false, status: 400, error: "Cover image too large (max 5 MB)" };
  }
  const requestedPosterType = String(poster?.type || "").toLowerCase();
  const posterType = STUDIO_POSTER_MIME_TYPES.includes(requestedPosterType)
    ? requestedPosterType
    : "image/jpeg";

  if (!(await ensureRecordingsBucket())) {
    return { ok: false, status: 503, error: "Storage is unavailable right now" };
  }

  const id = randomUUID();
  const videoPath = buildStudioVideoPath(id, videoType);
  const posterPath = buildStudioPosterPath(id, posterType);

  const [videoUpload, posterUpload] = await Promise.all([
    supabaseAdmin.storage.from(STUDIO_BUCKET).createSignedUploadUrl(videoPath, { upsert: true }),
    supabaseAdmin.storage.from(STUDIO_BUCKET).createSignedUploadUrl(posterPath, { upsert: true }),
  ]);
  if (videoUpload.error || posterUpload.error) {
    logError("studio:sign-upload-failed", {
      video: videoUpload.error?.message,
      poster: posterUpload.error?.message,
    });
    return { ok: false, status: 502, error: "Could not prepare the upload" };
  }

  return {
    ok: true,
    id,
    videoPath,
    posterPath,
    videoUpload: { path: videoPath, token: videoUpload.data.token },
    posterUpload: { path: posterPath, token: posterUpload.data.token },
  };
}

const POSTER_NAME = /^poster\.(jpg|png|webp)$/;

/**
 * Record a finished upload in the manifest, after confirming the object really
 * landed in Storage. Idempotent: a re-finalize replaces the same id.
 */
export async function finalizeStudioVideo({ user, id, title, description, durationSec, width, height, sizeBytes } = {}) {
  if (!isStudioAdmin(user?.email)) {
    return { ok: false, status: 403, error: "Only Studio admins can upload videos" };
  }
  const safe = safeStudioId(id);
  if (!safe) return { ok: false, status: 400, error: "Missing video id" };

  if (!(await ensureRecordingsBucket())) {
    return { ok: false, status: 503, error: "Storage is unavailable right now" };
  }

  const { data: files, error } = await supabaseAdmin.storage
    .from(STUDIO_BUCKET)
    .list(`studio/videos/${safe}`);
  if (error) {
    logError("studio:verify-upload-failed", { id: safe, message: error?.message });
    return { ok: false, status: 502, error: "Could not verify the upload" };
  }

  const names = (files || []).map((file) => file.name);
  const videoName = names.includes("video.mp4")
    ? "video.mp4"
    : names.includes("video.webm")
      ? "video.webm"
      : null;
  if (!videoName) {
    return { ok: false, status: 400, error: "The video did not finish uploading" };
  }
  const posterName = names.find((name) => POSTER_NAME.test(name)) || "";

  const videoFile = (files || []).find((file) => file.name === videoName);
  const storedSize = Number(videoFile?.metadata?.size);

  const entry = normalizeStudioVideo({
    id: safe,
    title,
    description,
    videoPath: `studio/videos/${safe}/${videoName}`,
    posterPath: posterName ? `studio/videos/${safe}/${posterName}` : "",
    mimeType: videoName === "video.webm" ? "video/webm" : "video/mp4",
    sizeBytes: Number.isFinite(storedSize) && storedSize > 0 ? storedSize : sizeBytes,
    durationSec,
    width,
    height,
    createdBy: user?.name || user?.email || "",
    createdByEmail: user?.email || "",
    createdAt: new Date().toISOString(),
  });
  if (!entry) return { ok: false, status: 400, error: "Invalid video details" };

  const existing = await listStudioVideos();
  const next = sortStudioVideos([...existing.filter((video) => video.id !== safe), entry]);
  const saved = await saveStudioManifest(next);
  if (!saved.ok) return { ok: false, status: 502, error: "Could not save the video" };

  return { ok: true, video: entry };
}

/** Remove a published clip: storage objects first, then the manifest row. */
export async function deleteStudioVideo({ user, id } = {}) {
  if (!isStudioAdmin(user?.email)) {
    return { ok: false, status: 403, error: "Only Studio admins can delete videos" };
  }
  const safe = safeStudioId(id);
  if (!safe) return { ok: false, status: 400, error: "Missing video id" };

  const videos = await listStudioVideos();
  const target = videos.find((video) => video.id === safe);
  if (!target) return { ok: false, status: 404, error: "Video not found" };

  const paths = [target.videoPath, target.posterPath].filter(Boolean);
  if (paths.length) {
    const { error } = await supabaseAdmin.storage.from(STUDIO_BUCKET).remove(paths);
    if (error) logError("studio:delete-objects-failed", { id: safe, message: error?.message });
  }

  const saved = await saveStudioManifest(videos.filter((video) => video.id !== safe));
  if (!saved.ok) return { ok: false, status: 502, error: "Could not update the library" };
  return { ok: true };
}

async function signPath(path, ttlSec) {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(STUDIO_BUCKET)
    .createSignedUrl(path, ttlSec, { download: false });
  if (error) return null;
  return data?.signedUrl || null;
}

/** Signed playback URL for a single clip. */
export async function signStudioVideoUrl(video, ttlSec = SIGNED_URL_TTL_SEC) {
  const url = await signPath(video?.videoPath, ttlSec);
  if (!url) logError("studio:sign-video-failed", { id: video?.id });
  return url;
}

/**
 * Sign every poster in one Storage round-trip. Returns { [id]: signedUrl } so
 * the page can attach the right cover to each card.
 */
export async function signStudioPosterUrls(videos, ttlSec = SIGNED_URL_TTL_SEC) {
  const rows = (videos || []).filter((video) => video?.posterPath);
  if (!rows.length) return {};
  const { data, error } = await supabaseAdmin.storage
    .from(STUDIO_BUCKET)
    .createSignedUrls(rows.map((video) => video.posterPath), ttlSec, { download: false });
  if (error) {
    logError("studio:sign-posters-failed", { message: error?.message });
    return {};
  }
  const urls = {};
  data?.forEach((item, index) => {
    const video = rows[index];
    if (video && item?.signedUrl) urls[video.id] = item.signedUrl;
  });
  return urls;
}
