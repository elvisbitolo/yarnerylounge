import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { validateCommentText } from "@/lib/server/posts-core";

// Edit a comment. Text only — the parent (which comment it replies to) is
// fixed after posting. Sets editedAt so the UI can show the same marker as a
// post. Any commenter may fix their own comment; moderators may fix any.
export async function PATCH(req, { params }) {
  const { commentId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const limited = rateLimitGuard(`comment-edit:${user.uid}`, { limit: 60 });
  if (limited) return limited;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const check = validateCommentText(body?.text);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

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
    if (check.text === comment.text) {
      return NextResponse.json({ ok: true, text: comment.text, editedAt: 0, unchanged: true });
    }
    const editedAt = new Date();
    const updated = await prisma.postComment.update({
      where: { id: commentId },
      data: { text: check.text, editedAt },
    });
    return NextResponse.json({ ok: true, text: updated.text, editedAt: editedAt.getTime() });
  } catch (err) {
    logError("posts.comments.edit.prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to edit comment" }, { status: 500 });
  }
}

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