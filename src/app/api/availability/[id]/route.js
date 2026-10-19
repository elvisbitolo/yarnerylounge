import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { deleteAvailability, updateAvailability, parseAvailabilityInput } from "@/lib/server/availability";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Same validator as create, so an edit cannot save what the POST path rejects.
  const parsed = parseAvailabilityInput(body);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await updateAvailability(id, auth.user.uid, parsed);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id, eventId: result.eventId || null });
}

export async function DELETE(req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  const result = await deleteAvailability(id, auth.user.uid);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
