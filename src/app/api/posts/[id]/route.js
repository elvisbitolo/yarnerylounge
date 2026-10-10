import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";
import { mapPostRow } from "@/lib/server/posts-core";
import { idsFromExtra } from "@/lib/server/member-safety-core";
import { getUserDoc } from "@/lib/server/auth";

export async function DELETE(req, { params }) {
  const { id } = await params;

  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const canModerate = auth.userDoc?.role === "owner" || auth.userDoc?.role === "moderator";
    if (post.authorId !== auth.user.uid && !canModerate) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.post.delete({ where: { id } });
  } catch (err) {
    logError("posts.delete_failed", { postId: id, uid: auth.user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Single-post read used by share links (/feed?focus=<id>): returns the same
// shape as the feed so the client can merge the post into the list and scroll
// to it even when it falls outside the first page.
export async function GET(req, { params }) {
  const { id } = await params;

  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const userDoc = await getUserDoc(auth.user.uid);
    const blockedFromExtra = idsFromExtra(userDoc?.extra, "blockedMemberIds");
    const mutedFromExtra = idsFromExtra(userDoc?.extra, "mutedMemberIds");
    if (post.authorId !== auth.user.uid && (blockedFromExtra.has(post.authorId) || mutedFromExtra.has(post.authorId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [spaceRows, groupRows] = await Promise.all([
      post.spaceId ? prisma.spaceMember.findMany({ where: { userId: auth.user.uid }, select: { spaceId: true } }) : [],
      post.groupId ? prisma.groupMember.findMany({ where: { userId: auth.user.uid }, select: { groupId: true } }) : [],
    ]);
    const isOwner = userDoc?.role === "owner";
    const isSpaceMember = spaceRows.some((r) => r.spaceId === post.spaceId);
    const isGroupMember = groupRows.some((r) => r.groupId === post.groupId);
    if (post.spaceId && !isOwner && !isSpaceMember) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (post.groupId && !isOwner && !isGroupMember) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const mapped = mapPostRow(post);
    return NextResponse.json({ post: mapped });
  } catch (err) {
    logError("posts.get_failed", { postId: id, uid: auth.user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to load post" }, { status: 500 });
  }
}