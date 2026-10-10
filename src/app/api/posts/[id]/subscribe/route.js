import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";

// Follow / unfollow a post's replies ("Turn on notifications for this post").
// Commenting auto-subscribes elsewhere; this is the explicit toggle.
export async function GET(req, { params }) {
  const { id } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const prisma = getPrisma();
    const row = await prisma.postSubscription.findUnique({
      where: { postId_userId: { postId: id, userId: auth.user.uid } },
      select: { id: true },
    });
    return NextResponse.json({ subscribed: !!row });
  } catch (err) {
    logError("posts.subscribe_read_failed", { postId: id, error: err.message });
    return NextResponse.json({ error: "Failed to load subscription" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  const { id } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!post || post.deletedAt) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const existing = await prisma.postSubscription.findUnique({
      where: { postId_userId: { postId: id, userId: auth.user.uid } },
      select: { id: true },
    });

    if (existing) {
      await prisma.postSubscription.delete({ where: { id: existing.id } });
      return NextResponse.json({ subscribed: false });
    }
    await prisma.postSubscription.create({
      data: { postId: id, userId: auth.user.uid },
    });
    return NextResponse.json({ subscribed: true });
  } catch (err) {
    logError("posts.subscribe_failed", { postId: id, uid: auth.user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }
}
