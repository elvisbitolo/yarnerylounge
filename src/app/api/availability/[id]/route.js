import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { deleteAvailability } from "@/lib/server/availability";

export const dynamic = "force-dynamic";

export async function DELETE(req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  const result = await deleteAvailability(id, auth.user.uid);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}