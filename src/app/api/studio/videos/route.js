// Studio publishing: two-step direct-to-Storage upload.
//
//   init     -> mint signed upload targets for the chosen video + cover
//   finalize -> confirm the objects landed, then record the clip in the manifest
//
// The bytes travel browser -> Supabase Storage directly; only the small JSON
// control messages hit this function. Publishing is gated to the email
// allowlist in studio.js, so hiding the UI is never the only protection.

import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { createStudioUploadTargets, finalizeStudioVideo } from "@/lib/server/studio";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`studio:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body?.action === "init") {
    const result = await createStudioUploadTargets({
      user: auth.user,
      video: body.video,
      poster: body.poster,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      id: result.id,
      videoPath: result.videoPath,
      posterPath: result.posterPath,
      videoUpload: result.videoUpload,
      posterUpload: result.posterUpload,
    });
  }

  if (body?.action === "finalize") {
    const result = await finalizeStudioVideo({
      user: auth.user,
      id: body.id,
      title: body.title,
      description: body.description,
      durationSec: body.durationSec,
      width: body.width,
      height: body.height,
      sizeBytes: body.sizeBytes,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, video: result.video });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
