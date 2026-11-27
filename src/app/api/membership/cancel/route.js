import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { roleAfterRevoke } from "@/lib/server/shopify";
import { logError, logInfo } from "@/lib/server/log";
import {
  ShopifyCustomerError,
  cancelShopifyContracts,
  fetchShopifyCustomerProfile,
  isShopifyCustomerConfigured,
  resolveShopifyAccessToken,
} from "@/lib/server/shopify-customer.js";
import { selectCancellableContracts } from "@/lib/server/shopify-customer-core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const origin = req.nextUrl.origin;
    let shopifyCanceledContracts = 0;
    let shopifySkippedContracts = 0;
    let shopifyCustomerId = existing.shopifyCustomerId || null;

    try {
      if (!isShopifyCustomerConfigured(origin)) {
        throw new ShopifyCustomerError(
          "CONFIG_MISSING",
          "Shopify billing cancellation is not configured.",
          503,
        );
      }
      const accessToken = await resolveShopifyAccessToken(existing, origin);
      const profile = await fetchShopifyCustomerProfile(accessToken, origin);
      shopifyCustomerId = profile.customer?.id || shopifyCustomerId;
      const contracts = selectCancellableContracts(profile.contractNodes);
      const result = await cancelShopifyContracts({
        accessToken,
        contractIds: contracts.map((contract) => contract.id),
        origin,
      });
      shopifyCanceledContracts = result.canceled;
      shopifySkippedContracts = result.skipped;
    } catch (error) {
      if (error.code === "NOT_LINKED") {
        return NextResponse.json(
          {
            error: "Link your Shopify billing once before cancelling.",
            code: "LINK_SHOPIFY",
          },
          { status: 409 },
        );
      }
      if (error.code === "RELINK_REQUIRED" || error.code === "CUSTOMER_NOT_FOUND") {
        return NextResponse.json(
          {
            error: "Shopify billing needs to be linked again before cancelling.",
            code: "RELINK_REQUIRED",
          },
          { status: 409 },
        );
      }
      if (error.code === "CONFIG_MISSING") {
        return NextResponse.json(
          { error: "Shopify billing cancellation is not configured yet." },
          { status: 503 },
        );
      }
      logError("membership.shopify_cancel_failed", { uid, error: error.message, code: error.code });
      return NextResponse.json(
        {
          error: "We could not cancel your Shopify subscription. Nothing has changed. Please try again.",
          code: "SHOPIFY_CANCEL_FAILED",
        },
        { status: 502 },
      );
    }

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
            provider: "shopify",
            requestedAction: "cancel_subscription",
            billingStatus: shopifyCanceledContracts > 0 ? "cancelled_in_shopify" : "no_active_shopify_contract",
            shopifyCanceledContracts,
            shopifySkippedContracts,
            shopifyCustomerId,
            shopifyOrderId: existing.shopifyOrderId || null,
            email: existing.email || null,
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

    logInfo("membership.member_canceled_immediately", {
      uid,
      previousTier: currentTier,
      shopifyCanceledContracts,
      shopifySkippedContracts,
    });
    return NextResponse.json({
      ok: true,
      canceledAt: now.toISOString(),
      plan: "flirting",
      shopifyCanceledContracts,
      message: "Your plan and recurring billing are cancelled. You are now on the free Flirting tier.",
    });
  } catch (error) {
    logError("membership.cancel_failed", { error: error.message });
    return NextResponse.json({ error: "We could not cancel your plan. Please try again." }, { status: 500 });
  }
}
