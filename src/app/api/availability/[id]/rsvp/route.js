import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { toggleAvailabilityRsvp } from "@/lib/server/availability";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  const result = await toggleAvailabilityRsvp(id, {
    uid: auth.user.uid,
    name: auth.userDoc?.name || auth.user.displayName || "Member",
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ joined: result.joined });
}