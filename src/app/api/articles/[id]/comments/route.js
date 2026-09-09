import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { validateCommentText } from "@/lib/server/posts-core";
import { createNotification } from "@/lib/server/notifications";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET(req, { params }) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  try {
    const prisma = getPrisma();
    const rows = await prisma.articleComment.findMany({
      where: { articleId: id },
      orderBy: { createdAt: "asc" },
    });
    const comments = rows.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorName: r.authorName,
      text: r.text,
      createdAt: r.createdAt,
    }));
    return NextResponse.json({ comments });
  } catch (err) {
    logError("articles.comments.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`article-comment:${user.uid}`, { limit: 20 });
  if (limited) return limited;

  const { text } = await req.json();
  const check = validateCommentText(text);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const userDoc = await getUserDoc(user.uid);
  const authorName = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";

  try {
    const prisma = getPrisma();
    const row = await prisma.article.findUnique({ where: { id } });
    if (!row) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }
    const comment = await prisma.articleComment.create({
      data: {
        articleId: id,
        authorId: user.uid,
        authorName,
        text: check.text,
      },
    });
    if (row.authorId && row.authorId !== user.uid) {
      await createNotification({
        userId: row.authorId,
        type: "comment",
        actorId: user.uid,
        actorName: authorName,
        targetId: id,
        href: `/articles/${id}`,
        text: "commented on your article",
      });
    }
    return NextResponse.json({ id: comment.id });
  } catch (err) {
    logError("articles.comments.prisma_write_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}