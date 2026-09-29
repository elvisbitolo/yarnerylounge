// Issues a short-lived signed URL for playback.
//
// The Supabase URL is not baked into the page HTML. Asking for it per play
// means the credential lives only as long as one viewing session, rather than
// sitting in a DOM a member could copy and share.

import { NextResponse } from "next/server";
import { getRecording, signPlaybackUrl, signTranscriptUrl } from "@/lib/server/recordings";
import { guardJson, requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  const recording = await getRecording(id);

  // 404 rather than 403 for anything not readable: a member has no way to act
  // on the difference, and it avoids confirming that a row exists.
  if (!recording || recording.status !== "ready" || !recording.share) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const url = await signPlaybackUrl(recording);
  if (!url) {
    return NextResponse.json({ error: "Recording unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    url,
    transcriptUrl: await signTranscriptUrl(recording),
    expiresInSec: 3600,
  });
}
