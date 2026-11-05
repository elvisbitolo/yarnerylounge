import { NextResponse } from "next/server";
import { requireModerator, guardJson } from "@/lib/server/authorize";
import { logAudit } from "@/lib/server/audit";
import { getPrisma } from "@/lib/db/prisma";
import { mayWriteTier } from "@/lib/server/shopify";
import { isActiveSub } from "@/lib/server/billing";
import { logError, logInfo } from "@/lib/server/log";

const SUPABASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req, { params }) {
  const { id } = await params;
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { role, suspended, foundingMember, plan } = await req.json();

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const update = {};
  const existingSub = plan !== undefined
    ? await prisma.subscription.findFirst({ where: { OR: [{ id }, { userId: id }] } })
    : null;

  if (role !== undefined) {
    if (!["member", "moderator"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (auth.userDoc.role !== "owner") {
      return NextResponse.json({ error: "Only the owner can change roles" }, { status: 403 });
    }
    if (existing.role === "owner") {
      return NextResponse.json({ error: "Cannot change the owner's role" }, { status: 400 });
    }
    update.role = role;
  }
  if (suspended !== undefined) {
    if (existing.role === "owner" && suspended) {
      return NextResponse.json({ error: "Cannot suspend the owner" }, { status: 400 });
    }
    update.suspended = Boolean(suspended);
  }
  if (foundingMember !== undefined) {
    if (auth.userDoc.role !== "owner") {
      return NextResponse.json({ error: "Only the owner can change founding member status" }, { status: 403 });
    }
    update.foundingMember = Boolean(foundingMember);
  }
  if (plan !== undefined) {
    const validPlans = ["flirting", "hooking-up", "moving-in"];
    if (!validPlans.includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    if (auth.userDoc.role !== "owner") {
      return NextResponse.json({ error: "Only the owner can upgrade plans" }, { status: 403 });
    }
    const isActive = existingSub ? isActiveSub(existingSub) : false;
    if (!mayWriteTier({
      currentTier: existingSub?.tier,
      currentIsActive: isActive,
      incomingTier: plan,
    })) {
      return NextResponse.json({ 
        error: "Cannot downgrade tier. Current tier must be maintained or upgraded." 
      }, { status: 400 });
    }
    update.plan = plan;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: update });

      if (plan !== undefined) {
        await tx.subscription.upsert({
          where: { id },
          create: {
            id,
            userId: id,
            provider: "admin",
            status: "active",
            plan,
            tier: plan,
            planName: plan,
            role: existing.role,
            shopifyCustomerId: existing.shopifyCustomerId || "",
            shopifyOrderId: existing.shopifyOrderId || "",
            currentPeriodEnd: null,
            canceledAt: null,
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          },
          update: {
            plan,
            tier: plan,
            planName: plan,
            status: "active",
            currentPeriodEnd: null,
            canceledAt: null,
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          },
        });
      }
    });
  } catch (err) {
    logError("admin.members.update_failed", { error: err.message, uid: id });
    return NextResponse.json({ error: "Could not update member" }, { status: 500 });
  }

  if (plan !== undefined) {
    await logAudit({
      actorId: auth.user.uid,
      actorName: auth.userDoc?.name || auth.user.email || "",
      action: "member.plan_upgraded",
      targetId: id,
      metadata: { plan, prevPlan: existing.plan, role: existing.role },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  if (id === auth.user.uid) {
    return NextResponse.json({ error: "You can't delete your own account here" }, { status: 400 });
  }

  const prisma = getPrisma();
  const userRow = await prisma.user.findUnique({ where: { id } });
  if (!userRow) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (userRow.role === "owner" && auth.userDoc.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can delete the owner" }, { status: 403 });
  }

  try {
    if (SUPABASE_UUID.test(id)) {
      const { default: supabaseAdmin } = await import("@/lib/supabase/service");
      await supabaseAdmin.auth.admin.deleteUser(id);
    } else {
      logInfo("admin.members.delete_legacy_uid_skipped", { uid: id });
    }
  } catch (err) {
    logError("admin.members.delete_supabase_failed", { uid: id, error: err.message });
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  try {
    await deleteMemberData(prisma, id);
  } catch (err) {
    logError("admin.members.delete_prisma_failed", { error: err.message, uid: id });
    return NextResponse.json({ error: "Could not delete member" }, { status: 500 });
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "member.deleted",
    targetId: id,
    metadata: { name: userRow.name, email: userRow.email },
  });

  return NextResponse.json({ ok: true });
}
