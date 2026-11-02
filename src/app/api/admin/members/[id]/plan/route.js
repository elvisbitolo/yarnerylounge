import { NextResponse } from "next/server";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/server/audit";
import { sendEmail } from "@/lib/server/email";
import { logError } from "@/lib/server/log";
import { TIER_INFO, TIERS } from "@/lib/server/plans";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const tier = typeof body?.tier === "string" ? body.tier : "";
  const expiryInput = typeof body?.expiresAt === "string" ? body.expiresAt : "";
  if (!TIERS.includes(tier) || !/^\d{4}-\d{2}-\d{2}$/.test(expiryInput)) {
    return NextResponse.json({ error: "Choose a valid plan and expiry date." }, { status: 400 });
  }
  const expiresAt = new Date(`${expiryInput}T23:59:59.999Z`);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Expiry date must be in the future." }, { status: 400 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    const member = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, plan: true, expiresAt: true } });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (member.role === "owner") return NextResponse.json({ error: "The owner's plan cannot be changed here." }, { status: 400 });
    const previous = { tier: member.plan || "flirting", expiresAt: member.expiresAt?.toISOString() || null };
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { plan: tier, expiresAt, paymentStatus: "paid", isPrePaid: true, updatedAt: now } });
      const existing = await tx.subscription.findUnique({ where: { id } });
      const subscriptionData = {
        userId: id, provider: "manual", status: "active", plan: tier, planName: tier, tier, role: "", priceId: "",
        shopifyCustomerId: existing?.shopifyCustomerId || "", shopifyOrderId: existing?.shopifyOrderId || "",
        currentPeriodStart: now, currentPeriodEnd: expiresAt, trialStart: null, trialEnd: null,
        cancelAtPeriodEnd: false, canceledAt: null,
      };
      await tx.subscription.upsert({
        where: { id },
        create: { id, providerCustomerId: "", providerSubscriptionId: "", ...subscriptionData },
        update: subscriptionData,
      });
    });
    await logAudit({ actorId: auth.user.uid, actorName: auth.userDoc?.name || auth.user.email || "", action: "member.plan_changed", targetId: id, metadata: { previous, tier, expiresAt: expiresAt.toISOString(), provider: "manual" } });
    let emailSent = false;
    if (member.email) {
      try {
        const result = await sendEmail({
          to: member.email,
          subject: "Your Speakeasy membership has been updated",
          text: `Hello ${member.name || "there"},\n\nYour membership has been updated to ${TIER_INFO[tier].name}. Your access is valid through ${expiresAt.toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "UTC" })}.\n\nSign in to view your membership details.\n\nChrista's Speakeasy`,
        });
        emailSent = !!result?.ok;
      } catch (error) { logError("admin.members.plan_email_failed", { uid: id, error: error?.message }); }
    }
    return NextResponse.json({ ok: true, emailSent, tier, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    logError("admin.members.plan_update_failed", { uid: id, error: error?.message });
    return NextResponse.json({ error: "Could not update this member's plan." }, { status: 500 });
  }
}
