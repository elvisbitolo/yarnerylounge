import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { canAccessPost } from "@/lib/server/posts";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { createNotification } from "@/lib/server/notifications";
import { sendEmail } from "@/lib/server/email";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";
import { awardPoints, awardBadge, POINTS } from "@/lib/server/gamification";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { validateCommentText } from "@/lib/server/posts-core";
import { extractMentions, resolveMentions, sendMentionNotifications } from "@/lib/server/mentions";

export async function GET(req, { params }) {
  const { id: postId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userDoc = await getUserDoc(user.uid);
  const access = await canAccessPost(postId, user.uid, userDoc);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const limited = rateLimitGuard(`comments-read:${user.uid}`, { limit: 120 });
  if (limited) return limited;

  const limit = Number(req.nextUrl.searchParams.get("limit")) || 200;
  try {
    const prisma = getPrisma();
    const rows = await prisma.postComment.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
      take: Math.min(limit, 500),
    });
    const comments = rows.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorName: r.authorName,
      text: r.text,
      reactions: r.reactions,
      createdAt: r.createdAt,
    }));
    return NextResponse.json({ comments });
  } catch (err) {
    logError("posts.comments.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  const { id: postId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const limited = rateLimitGuard(`comment:${user.uid}`, { limit: 20 });
  if (limited) return limited;

  const { text } = await req.json();
  const check = validateCommentText(text);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const userDoc = await getUserDoc(user.uid);
  const caps = await getCapabilities(user.uid);
  if (!canWriteChat(caps) && !(userDoc?.role === "owner" || userDoc?.role === "moderator")) {
    return NextResponse.json({ error: "Live interaction requires an active membership" }, { status: 403 });
  }
  const access = await canAccessPost(postId, user.uid, userDoc);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const post = access.post;

  const authorName = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";
  let commentId = null;
  try {
    const prisma = getPrisma();
    const comment = await prisma.postComment.create({
      data: {
        postId,
        authorId: user.uid,
        authorName,
        text: check.text,
      },
    });
    await prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 }, lastActivityAt: new Date() },
    });
    commentId = comment.id;
  } catch (err) {
    logError("posts.comments.prisma_write_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }

  await awardPoints(user.uid, POINTS.COMMENT, authorName);
  await awardBadge(user.uid, "first_comment", authorName);

  const mentionUsernames = extractMentions(check.text);
  if (mentionUsernames.length > 0) {
    resolveMentions(mentionUsernames).then((mentions) =>
      sendMentionNotifications({
        mentions,
        actorId: user.uid,
        actorName: authorName,
        targetId: postId,
        href: `/feed`,
        text: "comment",
      })
    ).catch(() => {});
  }

  if (post.authorId !== user.uid) {
    await createNotification({
      userId: post.authorId,
      type: "comment",
      actorId: user.uid,
      actorName,
      targetId: postId,
      href: `/feed`,
      text: `commented on your post`,
    });

    const postAuthorDoc = await getUserDoc(post.authorId);
    if (postAuthorDoc) {
      const author = postAuthorDoc;
      if (author.email && author.notifications !== "off") {
        await sendEmail({
          to: author.email,
          subject: `New comment on your post`,
          text: `${authorName} commented: "${text.trim()}"\n\nView it in the community feed.`,
        }).catch((err) => {
          logError("email.comment_notify_failed", { postId, error: err.message });
        });
      }
    }
  }

  notifyOtherCommenters(postId, post.authorId, user.uid, authorName).catch(() => {});

  return NextResponse.json({ id: commentId });
}

async function notifyOtherCommenters(postId, postAuthorId, actorId, actorName) {
  try {
    const prisma = getPrisma();
    const rows = await prisma.postComment.findMany({
      where: { postId },
      select: { authorId: true },
      orderBy: { createdAt: "asc" },
    });
    const notified = new Set();
    for (const row of rows) {
      const authorId = row.authorId;
      if (!authorId) continue;
      if (authorId === actorId) continue;
      if (authorId === postAuthorId) continue;
      if (notified.has(authorId)) continue;
      notified.add(authorId);
      await createNotification({
        userId: authorId,
        type: "comment",
        actorId,
        actorName,
        targetId: postId,
        href: `/feed`,
        text: `also commented on this post`,
      }).catch(() => {});
    }
  } catch (err) {
    logError("posts.comments.prisma_commenters_failed", { error: err.message });
  }
}