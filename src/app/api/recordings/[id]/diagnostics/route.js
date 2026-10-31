import { NextResponse } from "next/server";
import { getRecording } from "@/lib/server/recordings";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

const DEVELOPER_EMAIL = "elvisbitolo11@gmail.com";

export async function GET(_request, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  if (String(auth.user?.email || "").toLowerCase() !== DEVELOPER_EMAIL) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const row = await getRecording(id);
  if (!row) return NextResponse.json({ error: "Recording not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    data: {
      id: row.id,
      initiatorId: row.initiatorId,
      roomId: row.roomId,
      roomName: row.roomName,
      jaasSessionId: row.jaasSessionId,
      jaasRecordingId: row.jaasRecordingId,
      status: row.status,
      storageBucket: row.storageBucket,
      storagePath: row.storagePath,
      thumbnailPath: row.thumbnailPath,
      transcriptPath: row.transcriptPath,
      sizeBytes: row.sizeBytes,
      durationSec: row.durationSec,
      attempts: row.attempts,
      sourceExpiresAt: row.sourceExpiresAt,
      pulledAt: row.pulledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastError: row.lastError,
      errorCode: row.lastError ? String(row.lastError).split(/[: ]/, 1)[0].slice(0, 80) : null,
    },
  });
}
