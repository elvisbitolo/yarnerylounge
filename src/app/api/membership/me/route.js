import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { deriveMembership } from "@/lib/server/membership";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

// Single, cached read that the client MembershipProvider consumes instead of
// hitting the DB per component. Falls back to the free "Flirting" profile
// on any server error so badges/locked CTAs never crash the app.
export async function GET() {
  try {
    const auth = await requireUser();
    const denied = guardJson(auth);
    if (denied) return denied;

    const rawExpiry = auth.userDoc?.expiresAt;
    const expiryMs = rawExpiry?.toMillis?.() ?? (rawExpiry instanceof Date ? rawExpiry.getTime() : Number(rawExpiry) || 0);
    const expiresAt = expiryMs > 0 ? new Date(expiryMs).toISOString() : null;
    const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiryMs - Date.now()) / 86400000)) : null;
    return NextResponse.json({ ok: true, membership: { ...deriveMembership(auth.userDoc), expiresAt, daysRemaining }, expiresAt, daysRemaining });
  } catch (err) {
    logError("membership.me_failed", { error: err.message });
    return NextResponse.json(
      { ok: false, membership: deriveMembership(null) },
      { status: 200 }
    );
  }
}