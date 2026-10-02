// Undo a delete: owners only, mirroring DELETE.

import { NextResponse } from "next/server";
import { restoreRecording } from "@/lib/server/recordings";
import { guardJson, requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const auth = await requireActiveMember({ owner: true });
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  try {
    const result = await restoreRecording(id);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 500;
      return NextResponse.json({ error: "Restore failed" }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Restore failed" }, { status: 500 });
  }
}
