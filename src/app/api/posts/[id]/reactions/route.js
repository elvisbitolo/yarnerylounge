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

  const limited = rateLimitGuard(`post-reaction:${user.uid}`, { limit: 60 });
  if (limited) return limited;
  const data = access.post;

  const body = await req.json().catch(() => ({}));
  const emoji = normalizedReactionEmoji(body?.emoji);
  if (!isValidReactionEmoji(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  const already = Boolean(data.reactions?.[emoji]?.[user.uid]);

  try {
    const prisma = getPrisma();
    const nextReactions = {
      ...(data.reactions || {}),
      [emoji]: { ...(data.reactions?.[emoji] || {}) },
    };
    if (already) {
      delete nextReactions[emoji][user.uid];
      if (Object.keys(nextReactions[emoji]).length === 0) {
        delete nextReactions[emoji];
      }
    } else {
      nextReactions[emoji][user.uid] = true;
    }
    await prisma.post.update({
      where: { id },
      data: { reactions: nextReactions },
    });

    if (!already && data.authorId && data.authorId !== user.uid) {
      const actorName =
        userDoc?.name || user.name || user.email?.split("@")[0] || "Member";
      const { createNotification } = await import("@/lib/server/notifications");
      await createNotification({
        userId: data.authorId,
        type: "like",
        actorId: user.uid,
        actorName,
        targetId: id,
        href: `/feed`,
        text: `Reacted ${emoji} to your post`,
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
    logError("posts.reactions.prisma_write_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update reaction" }, { status: 500 });
  }
}