import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { canAccessPost } from "@/lib/server/posts";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";
import { resolveActorId } from "@/lib/server/acting-as-core";
import { awardPoints, awardBadge, POINTS } from "@/lib/server/gamification";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { validateCommentText } from "@/lib/server/posts-core";


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
    const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean))];
    const [authorRows] = await Promise.all([
      authorIds.length
        ? prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, role: true, photoURL: true } })
        : Promise.resolve([]),
    ]);
    const roles = new Map(authorRows.map((a) => [a.id, a.role]));
    const photos = new Map(authorRows.map((a) => [a.id, a.photoURL || ""]));
    const mapped = rows.map((r) => {
      const createdAt =
        r.createdAt && typeof r.createdAt.toMillis === "function"
          ? r.createdAt.toMillis()
          : r.createdAt instanceof Date
            ? r.createdAt.getTime()
            : Number(r.createdAt) || 0;
      const editedAt = r.editedAt
        ? r.editedAt instanceof Date
          ? r.editedAt.getTime()
          : Number(r.editedAt) || 0
        : 0;
      const base = {
        id: r.id,
        authorId: r.authorId,
        authorName: r.authorName,
        authorPhotoUrl: photos.get(r.authorId) || "",
        text: r.text,
        reactions: r.reactions,
        authorRole: roles.get(r.authorId) || "",
        createdAt,
        editedAt,
        pinned: !!r.pinnedAt,
      };
      return r.parentId ? { ...base, parentId: r.parentId } : { ...base, replies: [] };
    });

    // Nest replies under their top-level comment (single level of threading),
    // and float the pinned comment to the top of the thread.
    const byTopLevel = new Map();
    const comments = [];
    for (const c of mapped) {
      if (c.parentId) {
        const parent = byTopLevel.get(c.parentId);
        if (parent) parent.replies.push(c);
      } else {
        byTopLevel.set(c.id, c);
        comments.push(c);
      }
    }
    comments.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
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

  const { text, parentId } = await req.json();
  const check = validateCommentText(text);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  let replyParentId = parentId || null;
  if (replyParentId) {
    const parent = await (async () => {
      try {
        const prisma = getPrisma();
        return await prisma.postComment.findUnique({ where: { id: replyParentId } });
      } catch {
        return null;
      }
    })();
    if (!parent || parent.postId !== postId || parent.parentId) {
      return NextResponse.json({ error: "Invalid reply target" }, { status: 400 });
    }
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

  const canModerate = userDoc?.role === "owner" || userDoc?.role === "moderator";
  if (post.lockedComments && !canModerate) {
    return NextResponse.json({ error: "Comments are locked on this post" }, { status: 403 });
  }

  const authorName = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";
  let commentId = null;
  try {
    const prisma = getPrisma();
    const comment = await prisma.postComment.create({
      data: {
        postId,
        parentId: replyParentId,
        authorId: user.uid,
        authorName,
        // Null unless published through an AccountGrant.
        createdById: resolveActorId(user),
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

  // The comment is stored; everything below is a side effect the member is
  // already waiting on. None of it gates seeing their own comment, and the
  // email in particular can take seconds, so none of it is awaited — the
  // response goes back as soon as the write lands.
  awardPoints(user.uid, POINTS.COMMENT, authorName).catch((err) => {
    logError("comments.award_points_failed", { postId, error: err.message });
  });
  awardBadge(user.uid, "first_comment", authorName).catch(() => {});



  return NextResponse.json({ id: commentId });
}
