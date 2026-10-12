// GET  -> a short-lived signed playback URL for a published clip (any member)
// DELETE -> remove a clip and its objects (Studio admins only)

import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { deleteStudioVideo, getStudioVideo, signStudioVideoUrl } from "@/lib/server/studio";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`studio-play:${auth.user.uid}`, { limit: 120 });
  if (limited) return limited;

  const { id } = await params;
  const video = await getStudioVideo(id);
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const url = await signStudioVideoUrl(video);
  if (!url) return NextResponse.json({ error: "Video unavailable" }, { status: 502 });
  return NextResponse.json({ url });
}

export async function DELETE(req, { params }) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`studio-delete:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;

  const { id } = await params;
  const result = await deleteStudioVideo({ user: auth.user, id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
