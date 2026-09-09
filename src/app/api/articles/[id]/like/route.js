import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`article-like:${user.uid}`, { limit: 60 });
  if (limited) return limited;

  try {
    const prisma = getPrisma();
    const row = await prisma.article.findUnique({ where: { id }, select: { likes: true } });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const likes = row.likes || {};
    const already = Object.prototype.hasOwnProperty.call(likes, user.uid);
    const nextLikes = { ...likes };
    if (already) {
      delete nextLikes[user.uid];
    } else {
      nextLikes[user.uid] = new Date();
    }
    await prisma.article.update({
      where: { id },
      data: { likes: nextLikes },
    });
    const count = Object.keys(likes).length + (already ? -1 : 1);
    return NextResponse.json({ liked: !already, count });
  } catch (err) {
    logError("articles.like.prisma_write_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update like" }, { status: 500 });
  }
}