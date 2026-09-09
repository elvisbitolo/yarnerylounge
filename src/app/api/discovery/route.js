import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { canModerate } from "@/lib/server/auth";
import { getLeaderboard } from "@/lib/server/gamification";
import { rankTopPosts, toMillis } from "@/lib/server/analytics-core";
import { listEvents } from "@/lib/server/events";
import { listSpaces } from "@/lib/server/spaces";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

function postCard(post) {
  return {
    id: post.id,
    text: (post.text || "").slice(0, 160),
    authorId: post.authorId || "",
    authorName: post.authorName || "Member",
    likeCount: Object.keys(post.likes || {}).length,
    commentCount: post.commentCount || 0,
    createdAt: toMillis(post.createdAt),
    kind: post.kind || "post",
  };
}

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  let postRows;
  let spaceRows;
  let groupRows;
  let spaceCountRows;
  let events;
  let spaces;
  let topMembers;
  try {
    const [posts, evts, spcs, members] = await Promise.all([
      getPrisma().post.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
      listEvents(),
      listSpaces(),
      getLeaderboard(6),
    ]);
    postRows = posts;
    events = evts;
    spaces = spcs;
    topMembers = members;

    const memberQueries = await Promise.all([
      getPrisma().spaceMember.findMany({
        where: { userId: auth.user.uid },
        take: 500,
        select: { spaceId: true },
      }),
      getPrisma().groupMember.findMany({
        where: { userId: auth.user.uid },
        take: 500,
        select: { groupId: true },
      }),
    ]);
    spaceRows = memberQueries[0];
    groupRows = memberQueries[1];
  } catch (err) {
    logError("discovery.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Could not load discovery" }, { status: 500 });
  }

  const posts = postRows.map((p) => ({
    id: p.id,
    text: p.text,
    authorId: p.authorId,
    authorName: p.authorName,
    commentCount: p.commentCount,
    createdAt: p.createdAt,
    kind: p.kind,
    likes: p.likes,
    pinned: p.pinned,
    pinnedAt: p.pinnedAt,
    spaceId: p.spaceId,
    groupId: p.groupId,
    hashtags: p.hashtags,
  }));

  const isStaff = canModerate(auth.userDoc);
  const memberships = {
    spaceIds: new Set(spaceRows.map((r) => r.spaceId)),
    groupIds: new Set(groupRows.map((r) => r.groupId)),
  };

  const canReadPost = (post) => {
    if (isStaff || post.authorId === auth.user.uid) return true;
    if (post.spaceId && !memberships.spaceIds.has(post.spaceId)) return false;
    if (post.groupId && !memberships.groupIds.has(post.groupId)) return false;
    return true;
  };

  const visibleSpaces = spaces.filter(
    (space) => isStaff || space.publicPreview || space.access !== "invite"
  );

  const filteredPosts = posts.filter(canReadPost);

  const featured = filteredPosts
    .filter((post) => post.pinned)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, 6)
    .map(postCard);

  const topPosts = rankTopPosts(filteredPosts).slice(0, 6).map(postCard);

  const now = Date.now();
  const upcomingEvents = events
    .filter((event) => event.status !== "deleted")
    .filter(
      (event) =>
        isStaff ||
        !event.spaceId ||
        event.publicPreview ||
        memberships.spaceIds.has(event.spaceId)
    )
    .map((event) => ({
      id: event.id,
      title: event.title,
      description: (event.description || "").slice(0, 120),
      startTime: toMillis(event.startTime),
      purchasePriceCents: event.purchasePriceCents || 0,
      spaceId: event.spaceId || "",
    }))
    .filter((event) => event.startTime >= now)
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 6);

  try {
    spaceCountRows = await getPrisma().spaceMember.findMany({
      where: { spaceId: { in: visibleSpaces.map((s) => s.id) } },
      select: { spaceId: true },
    });
  } catch (err) {
    logError("discovery.prisma_member_count_failed", { error: err.message });
    spaceCountRows = [];
  }
  const memberCountBySpace = {};
  for (const r of spaceCountRows) {
    memberCountBySpace[r.spaceId] = (memberCountBySpace[r.spaceId] || 0) + 1;
  }
  const topSpaces = visibleSpaces
    .map((space) => ({
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: (space.description || "").slice(0, 120),
      memberCount: memberCountBySpace[space.id] || 0,
      purchasePriceCents: space.purchasePriceCents || 0,
    }))
    .sort((a, b) => b.memberCount - a.memberCount)
    .slice(0, 6);

  return NextResponse.json({
    discovery: {
      featured,
      upcomingEvents,
      topPosts,
      topMembers,
      topSpaces,
    },
  });
}
