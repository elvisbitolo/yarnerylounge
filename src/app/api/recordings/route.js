// Library listing. Any active member may read the whole library: lounge
// recordings are a shared community artefact, not per-space content.

import { NextResponse } from "next/server";
import { listDeletedRecordings, listRecordings } from "@/lib/server/recordings";
import { serializeRecording } from "@/lib/server/recordings-core";
import { guardJson, requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId") || null;
  const limit = Number(searchParams.get("limit")) || 60;
  // The library polls with include=all so a processing card can flip to ready
  // without a manual refresh.
  const includeUnready = searchParams.get("include") === "all";
  const trash = searchParams.get("trash") === "1";

  try {
    if (trash) {
      if (auth.userDoc?.role !== "owner") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const deleted = await listDeletedRecordings({ limit });
      return NextResponse.json({ ok: true, data: deleted.map(serializeRecording) });
    }
    const rows = await listRecordings({ roomId, limit, includeUnready });
    return NextResponse.json({ ok: true, data: rows.map(serializeRecording) });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Failed to load recordings" }, { status: 500 });
  }
}
