// Stores a poster frame captured in the member's browser.
//
// The serverless runtime has no ffmpeg, so the library seeks a ready recording
// ~3s in, draws the frame to a canvas and POSTs the JPEG here. Any active
// member may contribute a frame for a shared recording, but only the first one
// wins: saveThumbnail keeps an existing frame, so the write is idempotent and
// cannot be churned by repeated visits.

import { NextResponse } from "next/server";
import { getRecording, saveThumbnail, signThumbnailUrl } from "@/lib/server/recordings";
import { parseThumbnailDataUrl } from "@/lib/server/recordings-core";
import { guardJson, requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

// A 640px JPEG is ~50-100KB in base64; anything near a megabyte is abusive.
const MAX_BODY_BYTES = 1024 * 1024;

export async function POST(req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const { id } = await params;
  const recording = await getRecording(id);
  // 404 rather than 403, matching the play endpoint: a member has no way to
  // act on the difference and it avoids confirming the row exists.
  if (!recording || recording.status !== "ready" || !recording.share || recording.deletedAt) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const image = parseThumbnailDataUrl(body?.image);
  if (!image) {
    return NextResponse.json({ error: "Invalid image" }, { status: 400 });
  }

  const saved = await saveThumbnail({
    recording,
    image,
    width: body?.width,
    height: body?.height,
  });
  if (!saved.ok) {
    return NextResponse.json({ error: "Could not save preview", code: saved.error }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    thumbnailUrl: await signThumbnailUrl({ ...recording, thumbnailPath: saved.thumbnailPath }),
  });
}
