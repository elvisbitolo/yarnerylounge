import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { canAccessPost, nextLikeState } from "@/lib/server/posts";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const userDoc = await getUserDoc(user.uid);
  const caps = await getCapabilities(user.uid);
  if (!canWriteChat(caps) && !(userDoc?.role === "owner" || userDoc?.role === "moderator")) {
    return NextResponse.json({ error: "Live interaction requires an active membership" }, { status: 403 });
  }
  const access = await canAccessPost(id, user.uid, userDoc);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const limited = rateLimitGuard(`like:${user.uid}`, { limit: 60 });
  if (limited) return limited;
  const data = access.post;

  const { already, liked, count } = nextLikeState(data.likes, user.uid);

  try {
    const prisma = getPrisma();
    const nextLikes = { ...(data.likes || {}) };
    if (already) {
      delete nextLikes[user.uid];
    } else {
      nextLikes[user.uid] = new Date();
    }
    await prisma.post.update({
      where: { id },
      data: { likes: nextLikes, lastActivityAt: new Date() },
    });
    if (!already && data.authorId && data.authorId !== user.uid) {
      const { createNotification } = await import("@/lib/server/notifications");
      const actorName = userDoc?.name || user.email?.split("@")[0] || "Member";
      await createNotification({
        userId: data.authorId,
        type: "like",
        actorId: user.uid,
        actorName,
        targetId: id,
        href: `/feed`,
        text: `Liked your post`,
      });
    }
    return NextResponse.json({ liked, count });
  } catch (err) {
    logError("posts.like.prisma_write_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update like" }, { status: 500 });
  }
}