import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET(req, { params }) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  try {
    const prisma = getPrisma();
    const row = await prisma.article.findUnique({ where: { id } });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: row.id,
      title: row.title || "",
      content: row.content || "",
      excerpt: row.excerpt || "",
      coverImage: row.coverImage || "",
      authorId: row.authorId || "",
      authorName: row.authorName || "Member",
      hashtags: row.hashtags || [],
      readTime: row.readTime || 1,
      likes: Object.keys(row.likes || {}),
      createdAt: row.createdAt ? new Date(row.createdAt).getTime() : 0,
    });
  } catch (err) {
    logError("articles.get.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load article" }, { status: 500 });
  }
}