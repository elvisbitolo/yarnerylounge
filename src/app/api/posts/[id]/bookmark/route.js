import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { canAccessPost } from "@/lib/server/posts";
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
  const limited = rateLimitGuard(`bookmark:${user.uid}`, { limit: 60 });
  if (limited) return limited;

  try {
    const prisma = getPrisma();
    const row = await prisma.post.findUnique({ where: { id }, select: { bookmarks: true } });
    if (!row) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const bookmarks = row.bookmarks || {};
    const bookmarked = !bookmarks[user.uid];
    const nextBookmarks = { ...bookmarks };
    if (bookmarked) {
      nextBookmarks[user.uid] = new Date();
    } else {
      delete nextBookmarks[user.uid];
    }
    await prisma.post.update({
      where: { id },
      data: { bookmarks: nextBookmarks },
    });
    const count = bookmarked
      ? Object.keys(bookmarks).length + 1
      : Object.keys(bookmarks).length - 1;
    return NextResponse.json({ bookmarked, count });
  } catch (err) {
    logError("posts.bookmark.prisma_write_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update bookmark" }, { status: 500 });
  }
}