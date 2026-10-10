import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";
import { mapPostRow, TRASH_RETENTION_MS } from "@/lib/server/posts-core";

// Restore a post from trash. Only the author or staff may do so, and only
// while it is still inside the retention window (after that the maintenance
// sweep has hard-deleted it, so there is nothing left to restore).
export async function POST(req, { params }) {
  const { id } = await params;

  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const canModerate = auth.userDoc?.role === "owner" || auth.userDoc?.role === "moderator";
    if (post.authorId !== auth.user.uid && !canModerate) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!post.deletedAt) {
      return NextResponse.json({ ok: true, post: mapPostRow(post), alreadyLive: true });
    }
    if (Date.now() - post.deletedAt.getTime() > TRASH_RETENTION_MS) {
      return NextResponse.json({ error: "This post is no longer recoverable" }, { status: 410 });
    }

    const updated = await prisma.post.update({
      where: { id },
      data: { deletedAt: null, deletedBy: null },
    });
    return NextResponse.json({ ok: true, post: mapPostRow(updated) });
  } catch (err) {
    logError("posts.restore_failed", { postId: id, uid: auth.user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to restore post" }, { status: 500 });
  }
}
