import { NextResponse } from "next/server";
import { requireModerator, guardJson } from "@/lib/server/authorize";
import { logAudit } from "@/lib/server/audit";
import { getPrisma } from "@/lib/db/prisma";
import { isActiveSub } from "@/lib/server/billing";
import { tierRank } from "@/lib/server/plans";
import { logError, logInfo } from "@/lib/server/log";
import { deleteMemberData } from "@/lib/server/delete-member-data";
import { normalizeAdminExpiry, normalizeAdminPlan, normalizeAdminRole } from "@/lib/server/admin-member-update";

// Plan duration mapping (days) - based on SHOPIFY_VARIANTS in shopify.js
const PLAN_DURATION_DAYS = {
  flirting: 0,    // Free tier - never expires
  "hooking-up": 30, // Monthly by default
  "moving-in": 30, // Monthly by default
};

const SUPABASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req, { params }) {
  const { id } = await params;
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const { suspended, foundingMember } = body;
  const planResult = normalizeAdminPlan(body.plan);
  if (!planResult.ok) return NextResponse.json({ error: planResult.error }, { status: 400 });
  const roleResult = normalizeAdminRole(body.role);
  if (!roleResult.ok) return NextResponse.json({ error: roleResult.error }, { status: 400 });
  const hasExpiry = Object.prototype.hasOwnProperty.call(body, "expiresAt");
  const expiryResult = normalizeAdminExpiry(body.expiresAt);
  if (!expiryResult.ok) return NextResponse.json({ error: expiryResult.error }, { status: 400 });

  const plan = planResult.plan;
  const role = roleResult.role;
  let expiresAt = expiryResult.expiresAt;

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const update = {};
  let periodEnd = null;
  const changesMembership = plan !== undefined || hasExpiry;
  const existingSub = changesMembership
    ? await prisma.subscription.findFirst({ where: { OR: [{ id }, { userId: id }] } })
    : null;

  const previousEffectivePlan = existingSub
    ? isActiveSub(existingSub) ? existingSub.tier || "flirting" : "flirting"
    : String(existing.role || "").toLowerCase() === "host" ? "moving-in" : existing.plan || "flirting";

  if (role !== undefined) {
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
  if (changesMembership) {
    if (auth.userDoc.role !== "owner") {
      return NextResponse.json({ error: "Only the owner can change membership plans" }, { status: 403 });
    }
    if (["owner", "moderator"].includes(String(existing.role || "").toLowerCase())) {
      return NextResponse.json({ error: "Staff membership access is controlled by their role" }, { status: 400 });
    }
    const targetPlan = plan || existingSub?.tier || existing.plan || "flirting";
    if (targetPlan === "flirting") {
      expiresAt = null;
    } else if (plan !== undefined && !hasExpiry) {
      const durationDays = PLAN_DURATION_DAYS[plan] || 0;
      expiresAt = durationDays > 0
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
        : null;
    }
    if (plan !== undefined) update.plan = plan;
    update.expiresAt = expiresAt;
    periodEnd = expiresAt;
  }

  const subscriptionPlan = plan || existingSub?.tier || existing.plan || "flirting";
  const subscriptionRole = role || existing.role;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: update });

      if (changesMembership) {
        if (existingSub) {
          await tx.subscription.update({
            where: { id: existingSub.id },
            data: {
              status: "active",
              plan: subscriptionPlan,
              tier: subscriptionPlan,
              planName: subscriptionPlan,
              role: subscriptionRole,
              currentPeriodEnd: periodEnd,
              trialEnd: null,
              canceledAt: null,
              cancelAtPeriodEnd: false,
              updatedAt: new Date(),
            },
          });
        } else {
          await tx.subscription.create({
            data: {
              id,
              userId: id,
              provider: "admin",
              status: "active",
              plan: subscriptionPlan,
              tier: subscriptionPlan,
              planName: subscriptionPlan,
              role: subscriptionRole,
              shopifyCustomerId: existing.shopifyCustomerId || "",
              shopifyOrderId: existing.shopifyOrderId || "",
              providerCustomerId: "",
              providerSubscriptionId: "",
              priceId: "",
              currentPeriodEnd: periodEnd,
              canceledAt: null,
              cancelAtPeriodEnd: false,
              updatedAt: new Date(),
            },
          });
        }
      }
    });
  } catch (err) {
    logError("admin.members.update_failed", { error: err.message, uid: id });
    return NextResponse.json({ error: "Could not update member" }, { status: 500 });
  }

  if (changesMembership) {
    await logAudit({
      actorId: auth.user.uid,
      actorName: auth.userDoc?.name || auth.user.email || "",
      action: "member.plan_changed",
      targetId: id,
      metadata: {
        plan: subscriptionPlan,
        prevPlan: previousEffectivePlan,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        changeType: tierRank(subscriptionPlan) < tierRank(previousEffectivePlan) ? "downgrade" : "upgrade_or_assignment",
        role: subscriptionRole,
        immediate: true,
      },
    });
  }
  if (role !== undefined && role !== existing.role) {
    await logAudit({
      actorId: auth.user.uid,
      actorName: auth.userDoc?.name || auth.user.email || "",
      action: "member.role_changed",
      targetId: id,
      metadata: { role, prevRole: existing.role },
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
