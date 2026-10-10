import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";
import { mapPostRow, validatePostText, editPostCheck } from "@/lib/server/posts-core";
import { idsFromExtra } from "@/lib/server/member-safety-core";
import { getUserDoc } from "@/lib/server/auth";
import { extractHashtags } from "@/lib/server/hashtags";

// Soft-delete (trash) by default — the post disappears from every feed but
// stays recoverable for TRASH_RETENTION_MS. Passing `{ purge: true }` performs
// the old hard delete immediately (the author emptying their own trash).
export async function DELETE(req, { params }) {
  const { id } = await params;

  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  let purge = false;
  try {
    const body = await req.json();
    purge = body?.purge === true;
  } catch {
    // No body is the normal case: a plain delete means "move to trash".
  }

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

    if (purge) {
      await prisma.post.delete({ where: { id } });
      return NextResponse.json({ ok: true, purged: true });
    }

    const deletedAt = new Date();
    await prisma.post.update({
      where: { id },
      data: { deletedAt, deletedBy: auth.user.uid },
    });
    return NextResponse.json({ ok: true, deletedAt: deletedAt.getTime() });
  } catch (err) {
    logError("posts.delete_failed", { postId: id, uid: auth.user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}

// Edit. Text and hashtags are editable forever (Facebook/LinkedIn rules) by
// the author or a moderator; media, polls and the post kind are locked after
// publishing (LinkedIn/Instagram rules). Every edit writes a PostVersion
// snapshot so the "Edited" marker can open a real history, like X.
export async function PATCH(req, { params }) {
  const { id } = await params;

  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const check = editPostCheck(post, {
      uid: auth.user.uid,
      isOwner: auth.userDoc?.role === "owner",
      isModerator: auth.userDoc?.role === "moderator",
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    // Media is immutable after publish: reject add/replace, allow removal.
    if (body.imageUrl !== undefined || body.videoUrl !== undefined) {
      return NextResponse.json(
        { error: "Media can't be changed after publishing — delete and repost instead" },
        { status: 400 }
      );
    }

    const data = {};
    let textChanged = false;

    if (body.text !== undefined) {
      const next = typeof body.text === "string" ? body.text.trim() : "";
      if (!next && !post.imageUrl && !post.videoUrl && !post.repostOfId && !post.quoteOfId) {
        return NextResponse.json({ error: "Post text required" }, { status: 400 });
      }
      if (next) {
        const valid = validatePostText(next);
        if (!valid.ok) {
          return NextResponse.json({ error: valid.error }, { status: 400 });
        }
        if (next !== post.text) {
          data.text = valid.text;
          data.hashtags = extractHashtags(valid.text);
          textChanged = true;
        }
      }
    }

    if (body.altText !== undefined) {
      data.altText = typeof body.altText === "string" ? body.altText.trim().slice(0, 1000) : "";
    }
    if (body.sensitive !== undefined) {
      data.sensitive = body.sensitive === true;
    }
    if (body.removeMedia === true) {
      // Removing media keeps the post; only the attachment goes away. Matches
      // Facebook's "remove photos from your post".
      if (!data.text && !post.text) {
        return NextResponse.json(
          { error: "Add text before removing the only attachment" },
          { status: 400 }
        );
      }
      data.imageUrl = null;
      data.videoUrl = null;
      data.altText = "";
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true, post: mapPostRow(post), unchanged: true });
    }

    if (textChanged) {
      // Snapshot the text we are replacing (the "before" state) so history
      // shows every prior revision, oldest first.
      await prisma.postVersion.create({
        data: {
          postId: id,
          text: post.text || "",
          kind: post.kind || "post",
          editorId: auth.user.uid,
          editorName: auth.userDoc?.name || null,
        },
      });
    }
    // Any real change marks the post edited, matching X/Facebook.
    data.editedAt = new Date();

    const updated = await prisma.post.update({ where: { id }, data });
    return NextResponse.json({ ok: true, post: mapPostRow(updated) });
  } catch (err) {
    logError("posts.edit_failed", { postId: id, uid: auth.user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to edit post" }, { status: 500 });
  }
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

    const isOwner = auth.userDoc?.role === "owner";
    const isModerator = auth.userDoc?.role === "moderator";
    const isAuthor = post.authorId === auth.user.uid;

    // Trashed posts are gone for everyone except staff.
    if (post.deletedAt && !isOwner && !isModerator) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    // A not-yet-due scheduled post is visible only to its author and staff.
    if (post.scheduledAt && post.scheduledAt.getTime() > Date.now() && !isAuthor && !isOwner && !isModerator) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    // Hidden posts disappear for everyone except the author and staff.
    if (post.hidden && !isAuthor && !isOwner && !isModerator) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    // Archived posts leave the public feed and are only reachable by the author
    // and staff.
    if (post.archivedAt && !isAuthor && !isOwner && !isModerator) {
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
