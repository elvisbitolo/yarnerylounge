// Storage + persistence for the lounge recordings library.
//
// Pipeline (see src/app/api/webhooks/jitsi/route.js):
//   JaaS RECORDING_UPLOADED -> Recording row (status=pending, sourceLink set)
//   -> pullRecording() streams the 24h preAuthenticatedLink into our own
//      private Supabase Storage bucket -> status=ready, share=true
//
// JaaS has no durable storage of its own: the file exists for 24 hours and only
// behind the preAuthenticatedLink. Everything after that is ours.

import { supabaseAdmin } from "@/lib/supabase/service";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  buildStoragePath,
  clampSize,
  defaultRecordingTitle,
  isSourceExpired,
  parseRecordingUploaded,
} from "./recordings-core";

export const RECORDINGS_BUCKET = "recordings";

// Playback URLs are handed to a member's browser; keep them short enough that
// a leaked link stops working quickly, but long enough to survive a page load.
const PLAYBACK_URL_TTL_SEC = 60 * 60;

// A single recording can be several hundred MB. Cap the pull so a pathological
// or spoofed payload cannot exhaust the function's memory/disk.
//
// The bucket's own file_size_limit is the real ceiling (50GiB on the Pro plan,
// raised directly in storage.buckets because the createBucket API rejects a
// limit above 50MiB). 2GiB is a deliberate ceiling well under that: a JaaS
// session can run 6h, and an unbounded pull would be a denial-of-service
// vector. Raise with RECORDINGS_MAX_UPLOAD_BYTES if you need more.
const DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const SIZE_LIMIT_NOTE =
  "storage.buckets.file_size_limit cannot be raised through the Storage API (it rejects " +
  "any value above 50MiB). Set it with SQL: UPDATE storage.buckets SET file_size_limit = " +
  "53687091200 WHERE id = 'recordings';";
const configuredMax = Number(process.env.RECORDINGS_MAX_UPLOAD_BYTES);
export const MAX_UPLOAD_BYTES =
  Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : DEFAULT_MAX_UPLOAD_BYTES;

// The pull buffers the whole file in memory before uploading (see pullRecording:
// forwarding a live CDN stream into storage-js trips Supabase's parser on the
// Vercel runtime). MAX_UPLOAD_BYTES is the absolute guard; this tighter ceiling
// keeps a single ArrayBuffer comfortably inside the function's memory budget.
// Raise with RECORDINGS_MAX_IN_MEMORY_BYTES when a lounge records longer.
const DEFAULT_MAX_IN_MEMORY_BYTES = 384 * 1024 * 1024;
const configuredMemory = Number(process.env.RECORDINGS_MAX_IN_MEMORY_BYTES);
export const MAX_IN_MEMORY_BYTES =
  Number.isFinite(configuredMemory) && configuredMemory > 0
    ? configuredMemory
    : DEFAULT_MAX_IN_MEMORY_BYTES;

let bucketChecked = false;

/**
 * Ensure the private recordings bucket exists. Idempotent, and the result is
 * cached per warm instance — Supabase has no "create if not exists" for
 * buckets, and this runs on the hot path of every library page load.
 */
export async function ensureRecordingsBucket() {
  if (bucketChecked) return true;
  const { data, error } = await supabaseAdmin.storage.getBucket(RECORDINGS_BUCKET);
  if (!error && data) {
    bucketChecked = true;
    // The bucket's own file_size_limit is the real ceiling; MAX_UPLOAD_BYTES is
    // only our pre-flight guard. getBucket reports null when the project
    // default (50MiB) applies, which is below anything worth recording.
    const limit = data.file_size_limit ?? null;
    if (limit !== null && limit < MAX_UPLOAD_BYTES) {
      logError("recordings:bucket-limit-below-app-cap", {
        bucketLimitBytes: limit,
        appCapBytes: MAX_UPLOAD_BYTES,
        note: SIZE_LIMIT_NOTE,
      });
    }
    return true;
  }
  // Deliberately no fileSizeLimit: the Storage API rejects any value above
  // 50MiB ("The object exceeded the maximum allowed size"), so asking for our
  // real cap would fail the whole call and leave the bucket at the tiny
  // project default. See SIZE_LIMIT_NOTE for how the ceiling is actually set.
  const { error: createError } = await supabaseAdmin.storage.createBucket(RECORDINGS_BUCKET, {
    public: false,
    allowedMimeTypes: ["video/mp4", "video/webm", "text/vtt", "text/plain", "application/json"],
  });
  // Already-exists is a benign race between two cold instances.
  if (createError && !/already exists/i.test(createError.message || "")) {
    logError("recordings:bucket-create-failed", { message: createError?.message });
    return false;
  }
  logError("recordings:bucket-created", { note: SIZE_LIMIT_NOTE });
  bucketChecked = true;
  return true;
}

/**
 * Record a RECORDING_UPLOADED webhook. Returns { recording, created } where
 * `created` is false when this delivery was a duplicate — JaaS documents that
 * a repeated idempotencyKey must be ignored.
 */
export async function recordUploadedEvent(payload, { room, title, appId = "" } = {}) {
  const parsed = parseRecordingUploaded(payload, { appId });
  if (!parsed) return { recording: null, created: false, skipped: "no_link" };
  if (!parsed.idempotencyKey || !parsed.jaasSessionId) {
    return { recording: null, created: false, skipped: "incomplete" };
  }

  const prisma = getPrisma();
  const existing = await prisma.recording.findUnique({
    where: { idempotencyKey: parsed.idempotencyKey },
  });
  if (existing) return { recording: existing, created: false, skipped: "duplicate" };

  const roomName = room?.name || parsed.roomName || null;
  const row = await prisma.recording.create({
    data: {
      idempotencyKey: parsed.idempotencyKey,
      jaasSessionId: parsed.jaasSessionId,
      jaasRecordingId: parsed.jaasRecordingId,
      roomId: room?.id || null,
      roomName,
      title: title || defaultRecordingTitle({ roomName, startedAt: parsed.startedAt }),
      status: "pending",
      sourceLink: parsed.sourceLink,
      sourceExpiresAt: parsed.sourceExpiresAt,
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt,
      durationSec: parsed.durationSec,
      share: false,
      participants: parsed.participants,
      initiatorId: parsed.initiatorId,
    },
  });
  return { recording: row, created: true };
}

/**
 * Read a fetch response body into memory, refusing anything over capBytes.
 * Works whether or not the server sent a content-length, and it bounds the
 * memory cost even when the declared length was absent or lied.
 */
async function readBodyBounded(upstream, capBytes) {
  const reader = upstream.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.byteLength) {
      total += value.byteLength;
      if (total > capBytes) {
        await reader.cancel().catch(() => {});
        throw new Error("recording_too_large_for_memory");
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Copy the file out of JaaS and into our bucket.
 *
 * The body is read into memory (bounded by MAX_IN_MEMORY_BYTES) rather than
 * piped straight through: a foreign ReadableStream forwarded into storage-js
 * intermittently makes Supabase reject the upload with
 * "Multipart: Boundary not found" on the Vercel runtime, while buffered bytes
 * always round-trip cleanly. The tradeoff is that a recording above the
 * in-memory ceiling is refused instead of spilling the function's memory.
 *
 * Returns { ok, skipped?, error? } — never throws, so one bad recording cannot
 * take down the ingest sweep.
 */
export async function pullRecording(recording) {
  if (!recording) return { ok: false, error: "no_recording" };
  if (recording.status === "ready" && recording.storagePath) return { ok: true, skipped: "ready" };

  const link = recording.sourceLink;
  if (!link) return { ok: false, error: "no_source_link" };
  if (isSourceExpired(recording.sourceExpiresAt)) {
    await failRecording(recording.id, "jaas_link_expired");
    return { ok: false, error: "source_expired" };
  }

  const prisma = getPrisma();
  if (!(await ensureRecordingsBucket())) {
    return { ok: false, error: "bucket_unavailable" };
  }

  // Claim the row so a concurrent sweep cannot double-download the same file.
  const claimed = await prisma.recording.updateMany({
    where: { id: recording.id, status: { in: ["pending", "failed"] } },
    data: { status: "processing", attempts: { increment: 1 }, lastError: null },
  });
  if (claimed.count === 0) return { ok: false, skipped: "claimed_elsewhere" };

  try {
    const upstream = await fetch(link, { redirect: "follow" });
    if (!upstream.ok || !upstream.body) {
      throw new Error(`jaas_download_${upstream.status}`);
    }
    const declared = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
      throw new Error("recording_too_large");
    }

    const bodyBytes = await readBodyBounded(upstream, MAX_IN_MEMORY_BYTES);

    const path = buildStoragePath({
      recordingId: recording.id,
      startedAt: recording.startedAt,
    });
    const { error: uploadError } = await supabaseAdmin.storage
      .from(RECORDINGS_BUCKET)
      .upload(path, bodyBytes, {
        // JaaS recordings are MP4s. Force it rather than trusting a CDN
        // content-type that may have been mangled in transit.
        contentType: "video/mp4",
        // "upsert" makes a retried pull overwrite a half-written object.
        upsert: true,
      });
    if (uploadError) throw new Error(`storage_upload_failed: ${uploadError.message}`);

    const { sizeBytes, sizeUnknown } = clampSize(declared);
    await prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: "ready",
        share: true,
        storageBucket: RECORDINGS_BUCKET,
        storagePath: path,
        sizeBytes,
        sizeUnknown,
        pulledAt: new Date(),
        lastError: null,
        // The credential has served its purpose; do not keep it around.
        sourceLink: null,
        title: recording.title || undefined,
      },
    });
    return { ok: true, path };
  } catch (error) {
    await failRecording(recording.id, error?.message || "pull_failed");
    return { ok: false, error: error?.message || "pull_failed" };
  }
}

async function failRecording(id, message) {
  try {
    const prisma = getPrisma();
    await prisma.recording.update({
      where: { id },
      data: { status: "failed", lastError: String(message).slice(0, 500) },
    });
  } catch (error) {
    logError("recordings:mark-failed", { id, message: error?.message });
  }
}

/** Store the TRANSCRIPTION_UPLOADED artefact alongside the recording. */
export async function attachTranscript({ jaasSessionId, sourceLink }) {
  if (!jaasSessionId || !sourceLink) return { ok: false, error: "incomplete" };
  const prisma = getPrisma();
  // JaaS sends no recording id on this event, so match on the session. Status
  // is deliberately NOT filtered: the transcript usually lands *after* the
  // video has been pulled and the row is already `ready`, and requiring a
  // pending row would silently drop most transcripts.
  const target = await prisma.recording.findFirst({
    where: { jaasSessionId, transcriptPath: null },
    orderBy: { createdAt: "desc" },
  });
  if (!target) return { ok: false, error: "no_recording" };
  if (isSourceExpired(target.sourceExpiresAt)) return { ok: false, error: "source_expired" };
  if (!(await ensureRecordingsBucket())) return { ok: false, error: "bucket_unavailable" };

  try {
    const upstream = await fetch(sourceLink, { redirect: "follow" });
    if (!upstream.ok || !upstream.body) throw new Error(`transcript_download_${upstream.status}`);
    const path = buildStoragePath({
      recordingId: target.id,
      startedAt: target.startedAt,
      kind: "transcript",
      ext: "vtt",
    });
    // Same buffering rationale as pullRecording: forward bytes, never the
    // live CDN stream. VTT sidecars are a few KB, so the ceiling is moot.
    const bodyBytes = await readBodyBounded(upstream, MAX_IN_MEMORY_BYTES);
    const { error } = await supabaseAdmin.storage
      .from(RECORDINGS_BUCKET)
      .upload(path, bodyBytes, { contentType: "text/vtt", upsert: true });
    if (error) throw new Error(`transcript_upload_failed: ${error.message}`);
    await prisma.recording.update({
      where: { id: target.id },
      data: { transcriptPath: path },
    });
    return { ok: true, path };
  } catch (error) {
    logError("recordings:transcript-failed", { id: target.id, message: error?.message });
    return { ok: false, error: error?.message };
  }
}

/** Recordings the library shows: pulled and shareable, newest first. */
export async function listRecordings({ roomId = null, limit = 60 } = {}) {
  const prisma = getPrisma();
  const rows = await prisma.recording.findMany({
    where: {
      status: "ready",
      share: true,
      ...(roomId ? { roomId } : {}),
    },
    // Array form, as Prisma 7 requires for more than one sort key. A plain
    // object here is a validation error, not a silent fallback.
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(1, limit), 200),
  });
  return rows;
}

export async function getRecording(id) {
  if (!id) return null;
  return getPrisma().recording.findUnique({ where: { id } });
}

/** Short-lived signed URL for playback. */
export async function signPlaybackUrl(recording, ttlSec = PLAYBACK_URL_TTL_SEC) {
  if (!recording?.storagePath || !recording.share) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(recording.storageBucket || RECORDINGS_BUCKET)
    .createSignedUrl(recording.storagePath, ttlSec, { download: false });
  if (error) {
    logError("recordings:sign-failed", { id: recording.id, message: error?.message });
    return null;
  }
  return data?.signedUrl || null;
}

/** Signed URL for the VTT sidecar, when the meeting was transcribed. */
export async function signTranscriptUrl(recording, ttlSec = PLAYBACK_URL_TTL_SEC) {
  if (!recording?.transcriptPath) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(recording.storageBucket || RECORDINGS_BUCKET)
    .createSignedUrl(recording.transcriptPath, ttlSec, { download: false });
  if (error) return null;
  return data?.signedUrl || null;
}

/**
 * Delete a recording and its stored objects. The DB row goes first: if the
 * storage delete fails we would otherwise have a row pointing at nothing.
 */
export async function deleteRecording(recording) {
  if (!recording) return { ok: false, error: "no_recording" };
  const prisma = getPrisma();
  const bucket = recording.storageBucket || RECORDINGS_BUCKET;
  const paths = [recording.storagePath, recording.transcriptPath].filter(Boolean);
  if (paths.length) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
    if (error) logError("recordings:storage-delete-failed", { id: recording.id, message: error?.message });
  }
  await prisma.recording.delete({ where: { id: recording.id } });
  return { ok: true };
}
