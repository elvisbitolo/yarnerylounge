import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { roleAfterRevoke } from "@/lib/server/shopify";
import { logError, logInfo } from "@/lib/server/log";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const auth = await requireUser();
    const denied = guardJson(auth);
    if (denied) return denied;

    // Staff access is assigned independently of a paid plan and must never be
    // revoked by a member billing action.
    if (["owner", "moderator"].includes(String(auth.userDoc?.role || "").toLowerCase())) {
      return NextResponse.json({ error: "Staff access is managed separately." }, { status: 403 });
    }

    const prisma = getPrisma();
    if (!prisma) return NextResponse.json({ error: "Membership service is unavailable." }, { status: 503 });

    const uid = auth.user.uid;
    const existing = await prisma.user.findUnique({ where: { id: uid } });
    if (!existing) return NextResponse.json({ error: "Member account was not found." }, { status: 404 });

    const currentTier = String(existing.plan || "").toLowerCase();
    if (!["hooking-up", "moving-in"].includes(currentTier)) {
      return NextResponse.json({ error: "There is no paid plan to cancel." }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason || "").trim().slice(0, 80);
    const note = String(body?.note || "").trim().slice(0, 500);
    const allowedReasons = new Set(["too_expensive", "not_using", "missing_features", "technical_issues", "taking_a_break", "other"]);
    const safeReason = allowedReasons.has(reason) ? reason : "";
    const now = new Date();
    const nextRole = roleAfterRevoke(existing.role);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: uid },
        data: {
          plan: "flirting",
          role: nextRole,
          paymentStatus: "cancelled",
          isPrePaid: false,
          expiresAt: now,
          updatedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: uid,
          actorName: existing.name || existing.email || "Member",
          action: "membership.cancelled",
          targetId: uid,
          metadata: {
            previousTier: currentTier,
            reason: safeReason || null,
            note: note || null,
            effectiveAt: now.toISOString(),
          },
        },
      });

      await tx.subscription.upsert({
        where: { id: uid },
        create: {
          id: uid,
          userId: uid,
          provider: "shopify",
          status: "canceled",
          plan: "monthly",
          planName: "flirting",
          tier: "flirting",
          role: nextRole,
          shopifyCustomerId: existing.shopifyCustomerId || "",
          shopifyOrderId: existing.shopifyOrderId || "",
          currentPeriodEnd: now,
          canceledAt: now,
          cancelAtPeriodEnd: false,
        },
        update: {
          status: "canceled",
          planName: "flirting",
          tier: "flirting",
          role: nextRole,
          currentPeriodEnd: now,
          canceledAt: now,
          cancelAtPeriodEnd: false,
        },
      });
    });

    logInfo("membership.member_canceled_immediately", { uid, previousTier: currentTier });
    return NextResponse.json({
      ok: true,
      canceledAt: now.toISOString(),
      plan: "flirting",
      message: "Your paid plan has been canceled. Paid access has ended immediately.",
    });
  } catch (error) {
    logError("membership.cancel_failed", { error: error.message });
    return NextResponse.json({ error: "We could not cancel your plan. Please try again." }, { status: 500 });
  }
}
