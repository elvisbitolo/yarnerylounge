import { NextResponse } from "next/server";
import { requireModerator, requireUser, guardJson } from "@/lib/server/authorize";
import { canManageMemberPlans, MEMBER_PLANS } from "@/lib/server/member-plan-admin";
import { logAudit } from "@/lib/server/audit";
import { getPrisma } from "@/lib/db/prisma";
import { deleteMemberData } from "@/lib/server/delete-member-data";
import { logError, logInfo } from "@/lib/server/log";

const SUPABASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const { role, suspended, foundingMember, plan } = body;
  const hasPlan = Object.prototype.hasOwnProperty.call(body, "plan");
  const planOnly = hasPlan && Object.keys(body).every((key) => key === "plan");

  let auth;
  if (planOnly) {
    auth = await requireUser();
    const denied = guardJson(auth);
    if (denied) return denied;
    if (!canManageMemberPlans(auth.user.email)) {
      return NextResponse.json({ error: "Not authorized to change member plans" }, { status: 403 });
    }
  } else {
    auth = await requireModerator();
    const denied = guardJson(auth);
    if (denied) return denied;
    if (hasPlan && !canManageMemberPlans(auth.user.email)) {
      return NextResponse.json({ error: "Not authorized to change member plans" }, { status: 403 });
    }
  }

  if (hasPlan && !MEMBER_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Invalid member plan" }, { status: 400 });
  }

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const update = {};
  if (hasPlan) update.plan = plan;
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

  try {
    await prisma.user.update({ where: { id }, data: update });
  } catch (err) {
    logError("admin.members.update_prisma_failed", { error: err.message, uid: id });
    return NextResponse.json({ error: "Could not update member" }, { status: 500 });
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: hasPlan
      ? "member.plan_changed"
      : role !== undefined
        ? "member.role_changed"
        : foundingMember !== undefined
          ? "member.founding_changed"
          : "member.suspended",
    targetId: id,
    metadata: {
      role,
      suspended,
      foundingMember,
      plan,
      previousPlan: existing.plan || "flirting",
      prevRole: existing.role,
    },
  });

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
