import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";
import { millis } from "@/lib/server/posts-core";

// Edit history for a post, oldest first, then the current text as the last
// entry — the same shape a reader expects from X's edit history timeline.
export async function GET(req, { params }) {
  const { id } = await params;

  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, text: true, kind: true, editedAt: true, createdAt: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const versions = await prisma.postVersion.findMany({
      where: { postId: id },
      orderBy: { createdAt: "asc" },
    });

    const history = versions.map((v) => ({
      id: v.id,
      text: v.text,
      kind: v.kind || "post",
      editorId: v.editorId || "",
      editorName: v.editorName || "",
      createdAt: millis(v.createdAt),
    }));
    history.push({
      id: "current",
      text: post.text,
      kind: post.kind || "post",
      editorId: "",
      editorName: "",
      createdAt: millis(post.createdAt),
      current: true,
    });

    return NextResponse.json({ history, editedAt: millis(post.editedAt) });
  } catch (err) {
    logError("posts.history_failed", { postId: id, uid: auth.user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
