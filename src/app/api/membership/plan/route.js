import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { toMillis } from "@/lib/server/billing";
import { logError, logInfo } from "@/lib/server/log";
import { tierLabel } from "@/lib/server/plans";
import { roleAfterRevoke } from "@/lib/server/shopify";
import {
  billingTier,
  canSelfManageMembership,
  normalizeMembershipPlan,
  selfServicePlanAction,
} from "@/lib/server/membership-self-service";

export const dynamic = "force-dynamic";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(req) {
  try {
    const auth = await requireUser();
    const denied = guardJson(auth);
    if (denied) return denied;

    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json({ error: "Membership service is unavailable." }, { status: 503 });
    }

    const uid = auth.user.uid;
    const existing = await prisma.user.findUnique({ where: { id: uid } });
    if (!existing) {
      return NextResponse.json({ error: "Member account was not found." }, { status: 404 });
    }
    if (!canSelfManageMembership(existing.role)) {
      return NextResponse.json({ error: "Staff access is managed separately." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const targetTier = normalizeMembershipPlan(body?.plan ?? body?.tier);
    if (!targetTier) {
      return NextResponse.json({ error: "Choose a valid membership plan." }, { status: 400 });
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { OR: [{ id: uid }, { userId: uid }] },
    });
    const currentTier = billingTier(existing, existingSub);
    const action = selfServicePlanAction(currentTier, targetTier);
    if (action === "current") {
      return NextResponse.json({ error: `You are already on ${tierLabel(targetTier)}.` }, { status: 409 });
    }
    if (action !== "downgrade" || targetTier === "flirting") {
      return NextResponse.json(
        { error: "Use the storefront to upgrade and Cancel to move to the free plan." },
        { status: 403 },
      );
    }

    const now = new Date();
    const currentEnd = Math.max(
      toMillis(existing.expiresAt),
      toMillis(existingSub?.currentPeriodEnd),
      toMillis(existingSub?.trialEnd),
    );
    const periodEnd = new Date(currentEnd > now.getTime() ? currentEnd : now.getTime() + THIRTY_DAYS_MS);
    const nextRole = roleAfterRevoke(existing.role);
    const subscriptionData = {
      status: "active",
      plan: "monthly",
      planName: targetTier,
      tier: targetTier,
      role: nextRole,
      currentPeriodEnd: periodEnd,
      trialEnd: null,
      canceledAt: null,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    };

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: uid },
        data: {
          plan: targetTier,
          role: nextRole,
          paymentStatus: "paid",
          isPrePaid: false,
          expiresAt: periodEnd,
          updatedAt: now,
        },
      });

      if (existingSub) {
        await tx.subscription.update({
          where: { id: existingSub.id },
          data: subscriptionData,
        });
      } else {
        await tx.subscription.create({
          data: {
            id: uid,
            userId: uid,
            provider: "self-service",
            ...subscriptionData,
            currentPeriodStart: now,
            shopifyCustomerId: existing.shopifyCustomerId || "",
            shopifyOrderId: existing.shopifyOrderId || "",
            providerCustomerId: "",
            providerSubscriptionId: "",
            priceId: "",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: uid,
          actorName: existing.name || existing.email || "Member",
          action: "membership.plan_changed",
          targetId: uid,
          metadata: {
            previousTier: currentTier,
            plan: targetTier,
            changeType: "downgrade",
            immediate: true,
            externalBillingUnaffected: true,
            effectiveAt: now.toISOString(),
          },
        },
      });
    });

    logInfo("membership.self_service_downgraded", { uid, previousTier: currentTier, plan: targetTier });
    return NextResponse.json({
      ok: true,
      plan: targetTier,
      message: `You are now on ${tierLabel(targetTier)}. External billing is unchanged.`,
    });
  } catch (error) {
    logError("membership.self_service_plan_change_failed", { error: error.message });
    return NextResponse.json({ error: "We could not change your plan. Please try again." }, { status: 500 });
  }
}
