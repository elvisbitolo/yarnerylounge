import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { deriveMembership } from "@/lib/server/membership";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

// Single, cached read that the client MembershipProvider consumes instead of
// hitting Firestore per component. Falls back to the free "Flirting" profile
// on any server error so badges/locked CTAs never crash the app.
export async function GET() {
  try {
    const auth = await requireUser();
    const denied = guardJson(auth);
    if (denied) return denied;

    return NextResponse.json({ ok: true, membership: deriveMembership(auth.userDoc) });
  } catch (err) {
    logError("membership.me_failed", { error: err.message });
    return NextResponse.json(
      { ok: false, membership: deriveMembership(null) },
      { status: 200 }
    );
  }
}