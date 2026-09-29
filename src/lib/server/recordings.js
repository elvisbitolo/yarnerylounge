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
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024;

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
    return true;
  }
  // Already-exists is a benign race between two cold instances.
  const { error: createError } = await supabaseAdmin.storage.createBucket(RECORDINGS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: ["video/mp4", "video/webm", "text/vtt", "text/plain", "application/json"],
  });
  if (createError && !/already exists/i.test(createError.message || "")) {
    logError("recordings:bucket-create-failed", { message: createError?.message });
    return false;
  }
  bucketChecked = true;
  return true;
}

/** Every field safe to send to a browser. Never includes sourceLink. */
export function serializeRecording(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || row.roomName || "Lounge recording",
    roomId: row.roomId,
    roomName: row.roomName,
    status: row.status,
    durationSec: row.durationSec,
    sizeBytes: row.sizeBytes,
    sizeUnknown: row.sizeUnknown,
    participants: Array.isArray(row.participants) ? row.participants : [],
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
    endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
    pulledAt: row.pulledAt ? new Date(row.pulledAt).toISOString() : null,
    hasTranscript: Boolean(row.transcriptPath),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
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
 * Copy the file out of JaaS and into our bucket.
 *
 * The response body is piped straight through rather than buffered: a 90-minute
 * lounge recording is easily several hundred MB, which would blow past the
 * Vercel function memory limit if held in memory.
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

    const path = buildStoragePath({
      recordingId: recording.id,
      startedAt: recording.startedAt,
    });
    const { error: uploadError } = await supabaseAdmin.storage
      .from(RECORDINGS_BUCKET)
      .upload(path, upstream.body, {
        contentType: upstream.headers.get("content-type") || "video/mp4",
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
    const { error } = await supabaseAdmin.storage
      .from(RECORDINGS_BUCKET)
      .upload(path, upstream.body, { contentType: "text/vtt", upsert: true });
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
    orderBy: { startedAt: "desc", createdAt: "desc" },
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
