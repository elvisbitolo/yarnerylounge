import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { canAccessPost } from "@/lib/server/posts";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  isValidReactionEmoji,
  normalizedReactionEmoji,
  summarizeReactions,
} from "@/lib/server/reactions-core";

export async function POST(req, { params }) {
  const { id, commentId } = await params;
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

  const limited = rateLimitGuard(`comment-reaction:${user.uid}`, { limit: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const emoji = normalizedReactionEmoji(body?.emoji);
  if (!isValidReactionEmoji(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const row = await prisma.postComment.findUnique({ where: { id: commentId } });
    if (!row) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    const comment = row;
    const already = Boolean(comment.reactions?.[emoji]?.[user.uid]);
    const nextReactions = {
      ...(comment.reactions || {}),
      [emoji]: { ...(comment.reactions?.[emoji] || {}) },
    };
    if (already) {
      delete nextReactions[emoji][user.uid];
      if (Object.keys(nextReactions[emoji]).length === 0) {
        delete nextReactions[emoji];
      }
    } else {
      nextReactions[emoji][user.uid] = true;
    }
    await prisma.postComment.update({
      where: { id: commentId },
      data: { reactions: nextReactions },
    });

    if (!already && comment.authorId && comment.authorId !== user.uid) {
      const actorName =
        userDoc?.name || user.name || user.email?.split("@")[0] || "Member";
      const { createNotification } = await import("@/lib/server/notifications");
      await createNotification({
        userId: comment.authorId,
        type: "like",
        actorId: user.uid,
        actorName,
        targetId: id,
        href: `/feed`,
        text: `Reacted ${emoji} to your comment`,
      }).catch(() => {});
    }

    const updatedReactions = nextReactions;
    return NextResponse.json({
      reactions: summarizeReactions(updatedReactions),
      reacted: already
        ? false
        : Boolean(updatedReactions?.[emoji]?.[user.uid]),
    });
  } catch (err) {
    logError("posts.comments.reactions.prisma_write_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update reaction" }, { status: 500 });
  }
}