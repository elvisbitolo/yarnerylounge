import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { deriveMembership } from "@/lib/server/membership";
import { getSubscription } from "@/lib/server/subscription";
import { effectiveExpiryMillis } from "@/lib/server/billing";
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

    const sub = await getSubscription(auth.user.uid);
    const expiryMs = effectiveExpiryMillis(sub, auth.userDoc);
    const expiresAt = expiryMs > 0 ? new Date(expiryMs).toISOString() : null;
    const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiryMs - Date.now()) / 86400000)) : null;
    const membership = deriveMembership(auth.userDoc, Date.now(), sub);
    return NextResponse.json({ ok: true, membership: { ...membership, expiresAt, daysRemaining }, expiresAt, daysRemaining });
  } catch (err) {
    logError("membership.me_failed", { error: err.message });
    return NextResponse.json(
      { ok: false, membership: deriveMembership(null) },
      { status: 200 }
    );
  }
}