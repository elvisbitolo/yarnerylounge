import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";

// Moderator actions on a post that are not covered by pin/delete:
//   hide / unhide      — remove from every feed without deleting (Facebook)
//   lock / unlock      — freeze comments on a post (Facebook / Instagram)
//   archive / unarchive — author or staff tidy a post away from the feed
// Every action is recorded in PostModerationLog so there is an audit trail and
// a "removed by a moderator" notice can be shown.
const MODERATOR_ACTIONS = ["hide", "unhide", "lock", "unlock"];
const ALL_ACTIONS = [...MODERATOR_ACTIONS, "archive", "unarchive"];

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const action = typeof body?.action === "string" ? body.action : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!ALL_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const userDoc = await getUserDoc(user.uid);
  const isMod = canModerate(userDoc);

  try {
    const prisma = getPrisma();
    const post = await prisma.post.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const isAuthor = post.authorId === user.uid;
    // Moderation actions are staff-only; archiving is the author's own tidy-up.
    if (MODERATOR_ACTIONS.includes(action) && !isMod) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if ((action === "archive" || action === "unarchive") && !isAuthor && !isMod) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = {};
    if (action === "hide") {
      data.hidden = true;
      data.hiddenBy = user.uid;
      data.hiddenReason = reason;
    } else if (action === "unhide") {
      data.hidden = false;
      data.hiddenBy = null;
      data.hiddenReason = null;
    } else if (action === "lock") {
      data.lockedComments = true;
    } else if (action === "unlock") {
      data.lockedComments = false;
    } else if (action === "archive") {
      data.archivedAt = new Date();
    } else if (action === "unarchive") {
      data.archivedAt = null;
    }

    const updated = await prisma.post.update({ where: { id }, data });

    await prisma.postModerationLog.create({
      data: {
        postId: id,
        action,
        actorId: user.uid,
        actorName: userDoc?.name || null,
        reason: reason || null,
      },
    }).catch((err) => {
      logError("posts.moderation_log_failed", { postId: id, action, error: err.message });
    });

    return NextResponse.json({
      ok: true,
      hidden: updated.hidden,
      lockedComments: updated.lockedComments,
      archivedAt: updated.archivedAt ? updated.archivedAt.getTime() : 0,
    });
  } catch (err) {
    logError("posts.moderate_failed", { postId: id, action, error: err.message });
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}
