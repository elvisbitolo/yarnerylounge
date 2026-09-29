// Jitsi as a Service webhook receiver for the recordings library.
//
// JaaS has no durable storage: a recording exists for 24 hours behind a
// short-lived `preAuthenticatedLink` delivered on RECORDING_UPLOADED. This
// endpoint is the only chance to copy the bytes somewhere we control, so the
// contract here is:
//   1. never trust the payload until the HMAC signature verifies
//   2. always answer 2xx for a verified event, so JaaS does not retry forever
//   3. do the slow work (the download) after the response, not before it
//
// Configure in the JaaS console: JaaS > Webhooks > Add endpoint
//   URL      https://www.christasspeakeasy.com/api/webhooks/jitsi
//   Events   RECORDING_STARTED, RECORDING_ENDED, RECORDING_UPLOADED,
//            TRANSCRIPTION_UPLOADED
//   Auth     leave blank — the X-Jaas-Signature HMAC is verified instead
// The secret from "Reveal secret" goes in JITSI_WEBHOOK_SECRET.

import { NextResponse, after } from "next/server";
import {
  attachTranscript,
  pullRecording,
  recordUploadedEvent,
} from "@/lib/server/recordings";
import { extractMeetingName, findRoomByMeeting, verifyJaasSignature } from "@/lib/server/recordings-core";
import { getJitsiAppId } from "@/lib/server/jitsi";
import { getPrisma } from "@/lib/db/prisma";
import { logError, logInfo } from "@/lib/server/log";

// Node runtime: signature verification needs node:crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The response is sent before the download starts, but the function is not
// released until `after()` settles.
export const maxDuration = 300;

const HANDLED = new Set([
  "RECORDING_STARTED",
  "RECORDING_ENDED",
  "RECORDING_UPLOADED",
  "TRANSCRIPTION_UPLOADED",
]);

export async function POST(req) {
  const secret = process.env.JITSI_WEBHOOK_SECRET;
  if (!secret) {
    logError("jaas.webhook.no_secret", {});
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // The raw text is required: the signature covers the exact bytes, so
  // re-serializing a parsed object would break verification.
  const body = await req.text();
  const signature = req.headers.get("x-jaas-signature");

  if (!verifyJaasSignature({ header: signature, body, secret })) {
    // Do not log the body: an unverified payload is attacker-controlled.
    logError("jaas.webhook.bad_signature", { hasHeader: Boolean(signature) });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Defence in depth: the signature proves the payload came from JaaS, this
  // proves it was minted for *our* tenant and not a customer sharing 8x8.
  const appId = getJitsiAppId();
  // JaaS has been observed sending appId as both a string and a number, so
  // compare as strings or a legitimate delivery gets rejected.
  if (appId && payload.appId && String(payload.appId) !== String(appId)) {
    logError("jaas.webhook.tenant_mismatch", {});
    return NextResponse.json({ error: "Unknown tenant" }, { status: 401 });
  }

  const eventType = String(payload.eventType || "");
  if (!HANDLED.has(eventType)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const meetingName = extractMeetingName(payload.fqn, appId);
  const room = await resolveRoom(meetingName);

  // STARTED/ENDED carry no download link, and a Recording row cannot exist
  // before RECORDING_UPLOADED. There is nothing durable to write, so these are
  // acknowledged for observability and to stop JaaS retrying them.
  if (eventType === "RECORDING_STARTED" || eventType === "RECORDING_ENDED") {
    logInfo("jaas.webhook.recording_lifecycle", { eventType, room: room?.id || null });
    return NextResponse.json({ ok: true });
  }

  if (eventType === "RECORDING_UPLOADED") {
    return handleRecordingUploaded(payload, room, appId);
  }

  // TRANSCRIPTION_UPLOADED
  const sourceLink = payload?.data?.preAuthenticatedLink;
  if (sourceLink) {
    after(async () => {
      const result = await attachTranscript({ jaasSessionId: payload.sessionId, sourceLink });
      if (!result.ok) logError("jaas.webhook.transcript", { message: result.error });
    });
  }
  return NextResponse.json({ ok: true });
}

async function handleRecordingUploaded(payload, room, appId) {
  // A room with recording disabled must not end up with a library entry. The
  // host is stopped earlier (the JWT withholds the recording feature), so this
  // is the backstop for a host who recorded before the room was switched off.
  if (room && room.recordingAllowed === false) {
    logInfo("jaas.webhook.recording_not_allowed", { roomId: room.id });
    return NextResponse.json({ ok: true, ignored: "recording_not_allowed" });
  }

  let created;
  try {
    created = await recordUploadedEvent(payload, { room, appId });
  } catch (error) {
    logError("jaas.webhook.record_failed", { message: error?.message });
    return NextResponse.json({ error: "Could not record event" }, { status: 500 });
  }

  if (created.skipped) {
    return NextResponse.json({ ok: true, ignored: created.skipped });
  }

  // Duplicate delivery: the row already exists, so nothing more to do. Answer
  // 2xx so JaaS stops retrying.
  if (!created.created) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const recording = created.recording;
  if (!recording?.sourceLink) {
    return NextResponse.json({ ok: true, ignored: "no_source_link" });
  }

  // Copy the bytes after the response. The 24h link makes a failed pull
  // recoverable via /api/cron/recording-ingest, so a transient error here is
  // not the end of the recording.
  after(async () => {
    try {
      const result = await pullRecording(recording);
      if (!result.ok && !result.skipped) {
        logError("jaas.webhook.pull_failed", { id: recording.id, message: result.error });
      }
    } catch (error) {
      logError("jaas.webhook.pull_threw", { id: recording.id, message: error?.message });
    }
  });

  return NextResponse.json({ ok: true, id: recording.id });
}

/** Map the JaaS conference name back to one of our rooms. */
async function resolveRoom(meetingName) {
  if (!meetingName) return null;
  try {
    const prisma = getPrisma();
    const rooms = await prisma.room.findMany({
      where: { status: "active" },
      select: { id: true, name: true, slug: true, recordingAllowed: true },
    });
    return findRoomByMeeting(rooms, meetingName);
  } catch (error) {
    logError("jaas.webhook.room_lookup_failed", { message: error?.message });
    return null;
  }
}

// Deployment check, used before pointing the JaaS console at this route so we
// never collect a run of 404s. Strictly read-only: this endpoint is
// unauthenticated, so a GET must not create infrastructure. The bucket is
// created lazily on the first signed-in request instead.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "jitsi-webhook",
    configured: Boolean(process.env.JITSI_WEBHOOK_SECRET),
  });
}
