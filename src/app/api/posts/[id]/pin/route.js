import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userDoc = await getUserDoc(user.uid);
  if (!canModerate(userDoc)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const prisma = getPrisma();
    const row = await prisma.post.findUnique({ where: { id }, select: { pinned: true } });
    if (!row) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const pinned = !row.pinned;
    await prisma.post.update({
      where: { id },
      data: { pinned, pinnedAt: pinned ? new Date() : null },
    });
    return NextResponse.json({ pinned });
  } catch (err) {
    logError("posts.pin.prisma_write_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update pin" }, { status: 500 });
  }
}