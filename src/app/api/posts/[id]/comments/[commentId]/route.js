import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function DELETE(req, { params }) {
  const { id: postId, commentId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const limited = rateLimitGuard(`comment-delete:${user.uid}`, { limit: 60 });
  if (limited) return limited;

  const userDoc = await getUserDoc(user.uid);

  try {
    const prisma = getPrisma();
    const comment = await prisma.postComment.findUnique({ where: { id: commentId } });
    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    const canModerate = userDoc?.role === "owner" || userDoc?.role === "moderator";
    if (comment.authorId !== user.uid && !canModerate) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.postComment.delete({ where: { id: commentId } });
    await prisma.post.updateMany({
      where: { id: postId },
      data: { commentCount: { increment: -1 } },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("posts.comments.delete.prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}