// Deleting a recording is owner-only. It moves the recording to the Trash
// rather than erasing it: the library hides it immediately, Undo restores it,
// and the purge sweep removes the bytes after 30 days.

import { NextResponse } from "next/server";
import { getRecording, softDeleteRecording } from "@/lib/server/recordings";
import { guardJson, requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

export async function DELETE(req, { params }) {
  const auth = await requireActiveMember({ owner: true });
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  const recording = await getRecording(id);
  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  try {
    const result = await softDeleteRecording(recording, auth.user?.uid || null);
    if (!result.ok) {
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Delete failed" }, { status: 500 });
  }
}
