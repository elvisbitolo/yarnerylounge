// Deleting a recording is owner-only and irreversible: the file is removed from
// storage, not hidden. There is no soft-delete or recycle bin, because a
// recording of a real conversation is the kind of thing a member may need gone
// completely.

import { NextResponse } from "next/server";
import { deleteRecording, getRecording } from "@/lib/server/recordings";
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
    const result = await deleteRecording(recording);
    if (!result.ok) {
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Delete failed" }, { status: 500 });
  }
}
