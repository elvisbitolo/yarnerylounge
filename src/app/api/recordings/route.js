// Library listing. Any active member may read the whole library: lounge
// recordings are a shared community artefact, not per-space content.

import { NextResponse } from "next/server";
import { listRecordings } from "@/lib/server/recordings";
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

  try {
    const rows = await listRecordings({ roomId, limit });
    return NextResponse.json({ ok: true, data: rows.map(serializeRecording) });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Failed to load recordings" }, { status: 500 });
  }
}
