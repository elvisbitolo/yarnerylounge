// Re-queues a failed recording pull for owners.
//
// Pulling buffers the whole file in memory, so this only flips the row back to
// `pending` and schedules the copy with `after()` — the same path the JaaS
// webhook uses. The ingest cron is the safety net if this attempt dies too.

import { NextResponse, after } from "next/server";
import { getRecording, pullRecording, retryRecording } from "@/lib/server/recordings";
import { guardJson, requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req, { params }) {
  const auth = await requireActiveMember({ owner: true });
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  const recording = await getRecording(id);
  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const queued = await retryRecording(recording);
  if (!queued.ok) {
    // 410 is accurate for an expired JaaS link: the file is gone for good.
    const status = queued.error === "source_expired" ? 410 : 409;
    return NextResponse.json({ error: "This recording cannot be retried" }, { status });
  }

  after(async () => {
    try {
      await pullRecording({ ...recording, status: "pending" });
    } catch {
      /* pullRecording records its own failure on the row */
    }
  });

  return NextResponse.json({ ok: true, status: "pending" });
}
