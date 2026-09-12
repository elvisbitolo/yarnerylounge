import { NextResponse } from "next/server";
import { requireModerator, guardJson } from "@/lib/server/authorize";
import { logAudit } from "@/lib/server/audit";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";
import { deleteMemberData } from "@/lib/server/delete-member-data";

// Deletes the content a moderation report points at. Paths
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
    await deleteMemberData(prisma, memberMatch[2]);
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
    await deleteMemberData(prisma, targetId);
    return;
  }
  await prisma.post.delete({ where: { id: targetId } });
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
