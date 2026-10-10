import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";

// Pin / unpin a comment to the top of its thread. Moderators only, matching
// Facebook and YouTube. Only one comment per post stays pinned.
export async function POST(req, { params }) {
  const { id: postId, commentId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userDoc = await getUserDoc(user.uid);
  if (!canModerate(userDoc)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const prisma = getPrisma();
    const comment = await prisma.postComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.postId !== postId) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    const pinned = !comment.pinnedAt;
    if (pinned) {
      // Clear any existing pin in the same thread first so the state is a
      // single source of truth, not a collection.
      await prisma.postComment.updateMany({
        where: { postId, pinnedAt: { not: null } },
        data: { pinnedAt: null, pinnedBy: null },
      });
    }
    const updated = await prisma.postComment.update({
      where: { id: commentId },
      data: { pinnedAt: pinned ? new Date() : null, pinnedBy: pinned ? user.uid : null },
    });
    return NextResponse.json({ pinned: !!updated.pinnedAt });
  } catch (err) {
    logError("posts.comments.pin.prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update pin" }, { status: 500 });
  }
}
