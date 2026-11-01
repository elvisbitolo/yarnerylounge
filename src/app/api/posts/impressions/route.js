import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { sanitizeImpressionPayload, isTrackablePost } from "@/lib/server/impressions-core";
import { logError } from "@/lib/server/log";

const MAX_IMPRESSION_BATCH = 50;

export async function POST(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const limited = rateLimitGuard(`post-impressions:${auth.user.uid}`, { limit: 120 });
  if (limited) return limited;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const payload = sanitizeImpressionPayload(body);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { sessionKey, postIds } = payload;
  const prisma = getPrisma();

  try {
    const rows = await prisma.post.findMany({
      where: { id: { in: postIds }, deletedAt: null },
      select: {
        id: true,
        authorId: true,
        hidden: true,
        archivedAt: true,
        scheduledAt: true,
        spaceId: true,
        groupId: true,
      },
    });

const isStaff = auth.userDoc?.role === "owner" || auth.userDoc?.role === "moderator";
const extra = auth.userDoc?.extra || {};
const spaces = new Set(
  extra.spaceMemberIds ? [...extra.spaceMemberIds] : []
);
const groups = new Set(
  extra.groupMemberIds ? [...extra.groupMemberIds] : []
);
    // fallback: if extra not available, fetch memberships quickly
    if (spaces.size === 0) {
      try {
        const spaceRows = await prisma.spaceMember.findMany({
          where: { userId: auth.user.uid },
          select: { spaceId: true },
        });
        spaceRows.forEach((r) => spaces.add(r.spaceId));
      } catch (_) {}
    }
    if (groups.size === 0) {
      try {
        const groupRows = await prisma.groupMember.findMany({
          where: { userId: auth.user.uid },
          select: { groupId: true },
        });
        groupRows.forEach((r) => groups.add(r.groupId));
      } catch (_) {}
    }

    const now = Date.now();
    const data = [];
    for (const row of rows) {
      if (!isTrackablePost(
        {
          postId: row.id,
          authorId: row.authorId,
          spaceId: row.spaceId,
          groupId: row.groupId,
          hidden: row.hidden,
          archivedAt: row.archivedAt,
          scheduledAt: row.scheduledAt,
          deletedAt: row.deletedAt,
        },
        {
          uid: auth.user.uid,
          isStaff,
          spaces,
          groups,
          now,
        }
      )) {
        continue;
      }
      data.push({ postId: row.id, viewerId: auth.user.uid, sessionKey });
    }

    if (!data.length) {
      return NextResponse.json({ ok: true, recorded: 0 });
    }

    const result = await prisma.postImpression.createMany({
      data,
      skipDuplicates: true,
    });

    return NextResponse.json({ ok: true, recorded: result.count });
  } catch (err) {
    logError("postImpr.posts_failed", { error: err.message, uid: auth.user.uid });
    return NextResponse.json({ error: "Failed to record impressions" }, { status: 500 });
  }
}