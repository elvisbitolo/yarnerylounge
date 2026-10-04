import { NextResponse } from "next/server";
import { requireUser, requireModerator, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { logAudit } from "@/lib/server/audit";
import { updateContent } from "@/lib/server/admin-content";

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
/**
 * Article editing and deletion are staff-only. Creating an article is open to
 * any signed-in member (unchanged behaviour, see POST /api/articles).
 */
export async function PATCH(req, { params }) {
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await updateContent("article", id, body, { ...auth.user, ...auth.userDoc });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, changed: result.changed });
}

export async function DELETE(req, { params }) {
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  try {
    const prisma = getPrisma();
    const existing = await prisma.article.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.article.delete({ where: { id } });
    await logAudit({
      actorId: auth.user.uid,
      actorName: auth.user.displayName || auth.user.email || "",
      action: "article.deleted",
      targetId: id,
      metadata: { title: existing.title },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("articles.delete.prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to delete article" }, { status: 500 });
  }
}
