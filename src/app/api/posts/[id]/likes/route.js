import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";

// "Liked by" / reacted-by viewer list. Rows are built from the JSON maps the
// post already carries (uid -> true / uid -> emoji), so no extra tables and no
// pagination needed for the sizes a lounge post reaches.
function idsFromMap(map) {
  if (!map || typeof map !== "object") return [];
  return Object.keys(map);
}

export async function GET(req, { params }) {
  const { id } = await params;

  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({
      where: { id },
      select: { likes: true, reactions: true, deletedAt: true },
    });
    if (!post || post.deletedAt) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const likes = idsFromMap(post.likes);
    const reactions = post.reactions && typeof post.reactions === "object" ? post.reactions : {};

    // Collapse per-uid reactions into { uid: emoji } plus per-emoji counts.
    const reactionBy = {};
    const reactionCounts = {};
    for (const [emoji, users] of Object.entries(reactions)) {
      if (!users || typeof users !== "object") continue;
      reactionCounts[emoji] = Object.keys(users).length;
      for (const uid of Object.keys(users)) reactionBy[uid] = emoji;
    }

    const uids = [...new Set([...likes, ...Object.keys(reactionBy)])];
    const users = uids.length
      ? await prisma.user.findMany({
          where: { id: { in: uids } },
          select: { id: true, name: true, photoURL: true, username: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    const people = uids.map((uid) => {
      const u = byId.get(uid);
      return {
        id: uid,
        name: u?.name || "Member",
        photoUrl: u?.photoURL || "",
        username: u?.username || "",
        liked: likes.includes(uid),
        reaction: reactionBy[uid] || "",
      };
    });

    return NextResponse.json({
      likes: likes.length,
      reactions: reactionCounts,
      people,
    });
  } catch (err) {
    logError("posts.likes_failed", { postId: id, uid: auth.user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to load likes" }, { status: 500 });
  }
}
