import { NextResponse } from "next/server";
import { requireModerator, guardJson } from "@/lib/server/authorize";
import { logAudit } from "@/lib/server/audit";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

// Deletes the content a moderation report points at. Firestore `targetPath`s
// like "posts/{id}/comments/{commentId}" are resolved to the matching row.
async function deleteReportTarget(prisma, report) {
  const type = report.type || "post";
  const targetId = report.targetId || "";
  const path = report.targetPath || "";

  const match = path.match(/^(posts)\/([^/]+)(?:\/comments\/([^/]+))?$/);
  const memberMatch = path.match(/^(users)\/([^/]+)$/);
  const roomMsgMatch = path.match(/^rooms\/[^/]+\/messages\/([^/]+)$/);

  if (roomMsgMatch) {
    await prisma.roomMessage.delete({ where: { id: roomMsgMatch[1] } });
    return;
  }
  if (memberMatch) {
    await deleteMember(prisma, memberMatch[2]);
    return;
  }
  if (match) {
    if (match[3]) {
      await prisma.postComment.delete({ where: { id: match[3] } });
    } else {
      await prisma.post.delete({ where: { id: match[2] } });
    }
    return;
  }

  if (type === "comment") {
    await prisma.postComment.delete({
      where: { id: report.commentPostId || targetId },
    });
    return;
  }
  if (type === "member") {
    await deleteMember(prisma, targetId);
    return;
  }
  await prisma.post.delete({ where: { id: targetId } });
}

// Hard-deletes a member and every row referencing them (FK-safe).
async function deleteMember(prisma, id) {
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
}

export async function POST(req, { params }) {
  const { id } = await params;
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { action } = await req.json();
  if (!["dismiss", "delete"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const prisma = getPrisma();
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  if (report.status !== "open") {
    return NextResponse.json({ error: "Report already handled" }, { status: 400 });
  }

  if (action === "delete") {
    try {
      await deleteReportTarget(prisma, report);
    } catch (err) {
      logError("moderation.content_delete_failed", {
        reportId: id,
        targetPath: report.targetPath || report.type,
        targetId: report.targetId,
        error: err.message,
      });
    }
  }

  try {
    await prisma.report.update({
      where: { id },
      data: {
        status: action === "dismiss" ? "dismissed" : "resolved",
        handledBy: auth.user.uid,
        handledAt: new Date(),
      },
    });
  } catch (err) {
    logError("admin.reports.update_prisma_failed", { error: err.message, reportId: id });
    return NextResponse.json({ error: "Could not update report" }, { status: 500 });
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: action === "dismiss" ? "moderation.report_dismissed" : "moderation.content_removed",
    targetId: id,
    metadata: { type: report.type, targetPath: report.targetPath },
  });

  return NextResponse.json({ ok: true });
}