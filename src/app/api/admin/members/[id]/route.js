import { NextResponse } from "next/server";
import { requireModerator, guardJson } from "@/lib/server/authorize";
import { logAudit } from "@/lib/server/audit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { role, suspended, foundingMember } = await req.json();

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const update = {};
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
    action:
      role !== undefined
        ? "member.role_changed"
        : foundingMember !== undefined
          ? "member.founding_changed"
          : "member.suspended",
    targetId: id,
    metadata: { role, suspended, foundingMember, prevRole: existing.role },
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
    const { default: supabaseAdmin } = await import("@/lib/supabase/service");
    await supabaseAdmin.auth.admin.deleteUser(id);
  } catch (err) {
    if (err.status !== 404) {
      return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
    }
  }

  try {
    await prisma.$transaction([
      prisma.postComment.deleteMany({ where: { authorId: id } }),
      prisma.pollVote.deleteMany({ where: { userId: id } }),
      prisma.post.deleteMany({ where: { authorId: id } }),
      prisma.articleComment.deleteMany({ where: { authorId: id } }),
      prisma.article.deleteMany({ where: { authorId: id } }),
      prisma.notification.deleteMany({ where: { OR: [{ userId: id }, { actorId: id }] } }),
      prisma.follow.deleteMany({ where: { OR: [{ followerId: id }, { followingId: id }] } }),
      prisma.sticker.deleteMany({ where: { OR: [{ fromUid: id }, { toUid: id }] } }),
      prisma.recognition.deleteMany({ where: { OR: [{ fromUid: id }, { toUid: id }] } }),
      prisma.hostAssignment.deleteMany({ where: { userId: id } }),
      prisma.roomMessage.deleteMany({ where: { userId: id } }),
      prisma.roomSignal.deleteMany({ where: { userId: id } }),
      prisma.roomEvent.deleteMany({ where: { userId: id } }),
      prisma.roomPresence.deleteMany({ where: { userId: id } }),
      prisma.project.deleteMany({ where: { userId: id } }),
      prisma.rsvp.deleteMany({ where: { userId: id } }),
      prisma.availability.deleteMany({ where: { userId: id } }),
      prisma.availabilityRsvp.deleteMany({ where: { userId: id } }),
      prisma.conversationMessage.deleteMany({ where: { senderId: id } }),
      prisma.typing.deleteMany({ where: { userId: id } }),
      prisma.groupMember.deleteMany({ where: { userId: id } }),
      prisma.topicReply.deleteMany({ where: { authorId: id } }),
      prisma.topicThread.deleteMany({ where: { authorId: id } }),
      prisma.spaceMember.deleteMany({ where: { userId: id } }),
      prisma.quizResult.deleteMany({ where: { userId: id } }),
      prisma.progress.deleteMany({ where: { userId: id } }),
      prisma.certificate.deleteMany({ where: { userId: id } }),
      prisma.challengeParticipant.deleteMany({ where: { userId: id } }),
      prisma.report.deleteMany({ where: { OR: [{ reporterId: id }, { handledBy: id }] } }),
      prisma.auditLog.deleteMany({ where: { actorId: id } }),
      prisma.purchase.deleteMany({ where: { uid: id } }),
      prisma.spacePage.deleteMany({ where: { createdBy: id } }),
      prisma.question.deleteMany({ where: { createdBy: id } }),
      prisma.challenge.deleteMany({ where: { createdBy: id } }),
      prisma.course.deleteMany({ where: { createdBy: id } }),
      prisma.event.deleteMany({ where: { createdBy: id } }),
      prisma.conversation.deleteMany({ where: { createdBy: id } }),
      prisma.room.deleteMany({ where: { createdBy: id } }),
      prisma.spaceCollection.deleteMany({ where: { createdBy: id } }),
      prisma.space.deleteMany({ where: { createdBy: id } }),
      prisma.group.deleteMany({ where: { createdBy: id } }),
      prisma.subscription.deleteMany({ where: { id } }),
      prisma.gamification.deleteMany({ where: { id } }),
      prisma.pushSubscription.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);
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
