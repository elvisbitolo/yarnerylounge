import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { extractHashtags } from "@/lib/server/hashtags";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { isValidImageUrl } from "@/lib/server/posts-core";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const authorId = searchParams.get("authorId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);

  try {
    const prisma = getPrisma();
    const rows = await prisma.article.findMany({
      where: authorId ? { authorId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const articles = rows.map((row) => ({
      id: row.id,
      title: row.title || "",
      excerpt: row.excerpt || "",
      authorId: row.authorId || "",
      authorName: row.authorName || "Member",
      coverImage: row.coverImage || "",
      hashtags: row.hashtags || [],
      readTime: row.readTime || 1,
      createdAt: row.createdAt ? new Date(row.createdAt).getTime() : 0,
    }));
    return NextResponse.json({ articles });
  } catch (err) {
    logError("articles.list.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load articles" }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`article:${auth.user.uid}`, { limit: 10 });
  if (limited) return limited;

  const { title, content, excerpt, coverImage } = await req.json();

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }
  if (!content?.trim()) {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }

  const cleanTitle = title.trim().slice(0, 200);
  const cleanContent = content.trim();
  const cleanExcerpt = (excerpt || content.slice(0, 300)).trim().slice(0, 300);
  const cleanCover = typeof coverImage === "string" ? coverImage.trim() : "";
  if (cleanCover && !isValidImageUrl(cleanCover)) {
    return NextResponse.json({ error: "Invalid cover image URL" }, { status: 400 });
  }
  const wordCount = cleanContent.split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  const authorName = auth.userDoc?.name || auth.user.email || "Member";

  try {
    const prisma = getPrisma();
    const article = await prisma.article.create({
      data: {
        title: cleanTitle,
        content: cleanContent,
        excerpt: cleanExcerpt,
        coverImage: cleanCover,
        authorId: auth.user.uid,
        authorName,
        hashtags: extractHashtags(cleanTitle + " " + cleanContent),
        readTime,
        likes: {},
      },
    });
    return NextResponse.json({ ok: true, id: article.id });
  } catch (err) {
    logError("articles.prisma_create_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to create article" }, { status: 500 });
  }
}