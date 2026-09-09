import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getSpace, isSpaceMember } from "@/lib/server/spaces";
import { postAccessCheck, nextLikeState, mapPostRow } from "@/lib/server/posts-core";

export { postAccessCheck, nextLikeState, mapPostRow };

export async function canAccessPost(postId, uid, userDoc) {
  let post = null;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.post.findUnique({ where: { id: postId } });
      if (row) post = mapPostRow(row);
    } catch (err) {
      logError("posts.prisma_get_failed", { error: err.message });
    }
  }
  if (!post) {
    return { ok: false, status: 404, error: "Post not found" };
  }

  if (userDoc?.role === "owner" || post.authorId === uid) {
    return { ok: true, post };
  }

  const sub = await getAccessSub(uid);
  if (!isActiveSub(sub)) {
    return { ok: false, status: 403, error: "Active membership required" };
  }

  if (post.spaceId) {
    const space = await getSpace(post.spaceId);
    if (!space || space.status !== "active") {
      return { ok: false, status: 404, error: "Post not found" };
    }
    if (!(await isSpaceMember(post.spaceId, uid))) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
  }

  if (post.groupId) {
    let isMember = false;
    const prisma2 = getPrisma();
    if (prisma2) {
      try {
        const row = await prisma2.groupMember.findUnique({
          where: { id: `${post.groupId}_${uid}` },
        });
        isMember = !!row;
      } catch (err) {
        logError("posts.prisma_group_member_failed", { error: err.message });
      }
    }
    if (!isMember) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
  }

  return { ok: true, post };
}
