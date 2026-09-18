import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { getSpace, isSpaceMember } from "@/lib/server/spaces";
import { extractHashtags } from "@/lib/server/hashtags";
import { extractMentions, resolveMentions, sendMentionNotifications } from "@/lib/server/mentions";
import { awardPoints, awardBadge, POINTS } from "@/lib/server/gamification";
import { createNotification } from "@/lib/server/notifications";
import { runAutomations } from "@/lib/server/automations";
import { logError } from "@/lib/server/log";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { validatePostText, isValidImageUrl, POST_TEXT_MAX, mapPostRow, encodeCursor, decodeCursor, feedOrderBy, cursorAfter } from "@/lib/server/posts-core";
import { idsFromExtra } from "@/lib/server/member-safety-core";

export const dynamic = "force-dynamic";

// Tallies the tab counts over the whole *visible* community feed — not the
// paged/filtered/search slice — so the All / Following / Near You / Popular /
// Mine / Saved / Unanswered labels stay stable regardless of the active tab,
// sort, or search. Runs once per feed request and is skipped on load-more
// pages (the client keeps the counts it already received).
async function computeFeedCounts({ prisma, ctx, orderBy, PASS_TAKE }) {
  const counts = {
    total: 0,
    following: 0,
    near: 0,
    mine: 0,
    bookmarked: 0,
    hosts: 0,
    unanswered: 0,
    popular: 0,
  };
  const uid = ctx.uid;
  const { spaceIdParam, groupIdParam } = ctx;
  let cursor = null;
  let scanned = 0;
  const COUNT_SCAN_MAX = 100_000;
  while (scanned < COUNT_SCAN_MAX) {
    const batch = await prisma.post.findMany({
      where: cursorAfter(cursor),
      orderBy,
      take: PASS_TAKE,
    });
    if (!batch.length) break;
    scanned += batch.length;
    const last = batch[batch.length - 1];
    cursor = { pinned: !!last.pinned, createdAt: last.createdAt, id: last.id };
    for (const row of batch) {
      const authorId = row.authorId;
      if (authorId !== uid && (ctx.blockedIds.has(authorId) || ctx.mutedIds.has(authorId))) continue;
      if (spaceIdParam && row.spaceId !== spaceIdParam) continue;
      if (groupIdParam && row.groupId !== groupIdParam) continue;
      if (row.spaceId && !ctx.spaceIds.has(row.spaceId) && authorId !== uid) continue;
      if (row.groupId && !ctx.groupIds.has(row.groupId) && authorId !== uid) continue;
      counts.total += 1;
      if (authorId === uid || ctx.followingIds.has(authorId)) counts.following += 1;
      if (ctx.nearIds.has(authorId)) counts.near += 1;
      if (authorId === uid) counts.mine += 1;
      if (row.bookmarks && row.bookmarks[uid]) counts.bookmarked += 1;
      if (row.authorRole === "owner" || row.authorRole === "moderator") counts.hosts += 1;
      if (row.kind === "question" && (row.commentCount || 0) === 0) counts.unanswered += 1;
      if (row.likes && Object.keys(row.likes).length > 0) counts.popular += 1;
    }
  }
  return counts;
}

function filterVisiblePosts(posts, ctx) {
  const {
    followingOnly, nearOnly, spaceIdParam, groupIdParam,
    uid, followingIds, nearIds, spaceIds, groupIds,
    blockedIds, mutedIds, filterType, searchText,
  } = ctx;
  return posts.filter((data) => {
    if (data.authorId !== uid && blockedIds.has(data.authorId)) return false;
    if (data.authorId !== uid && mutedIds.has(data.authorId)) return false;
    if (followingOnly && data.authorId !== uid && !followingIds.has(data.authorId)) return false;
    if (nearOnly && !nearIds.has(data.authorId)) return false;
    if (spaceIdParam && data.spaceId !== spaceIdParam) return false;
    if (groupIdParam && data.groupId !== groupIdParam) return false;
    if (data.spaceId && !spaceIds.has(data.spaceId) && data.authorId !== uid) return false;
    if (data.groupId && !groupIds.has(data.groupId) && data.authorId !== uid) return false;
    if (filterType === "mine" && data.authorId !== uid) return false;
    if (filterType === "bookmarked" && !(data.bookmarks && data.bookmarks[uid])) return false;
    if (filterType === "hosts" && data.authorRole !== "owner" && data.authorRole !== "moderator") return false;
    if (filterType === "unanswered" && (data.kind !== "question" || (data.commentCount || 0) > 0)) return false;
    if (filterType === "popular" && !(data.likes && Object.keys(data.likes).length > 0)) return false;
    if (searchText) {
      const hay = ((data.text || "") + " " + (data.authorName || "") + " " + (data.hashtags || []).join(" ")).toLowerCase();
      if (!hay.includes(searchText)) return false;
    }
    return true;
  });
}

// Auto-populated "Featured" rail for the feed: moderator-pinned posts always
// show, then the hottest recent posts (likes + reactions + 2x comments + 3x
// poll votes, decayed by age) fill the rest.
const FEATURED_MIN_ENGAGEMENT = 8;
const FEATURED_HOT_WINDOW_MS = 7 * 86400000;
const FEATURED_CANDIDATE_CAP = 400;
const FEATURED_MAX = 5;

function engagementRaw(row) {
  return (
    Object.keys(row.likes || {}).length +
    Object.keys(row.reactions || {}).length +
    2 * (row.commentCount || 0) +
    (row.pollTotal || 0)
  );
}

// Visibility for the rail is deliberately community-wide: blocked/muted members
// and space/group membership still apply, but the active filter tab doesn't.
function isFeaturedVisible(row, ctx) {
  const uid = ctx.uid;
  if (row.authorId !== uid && ctx.blockedIds.has(row.authorId)) return false;
  if (row.authorId !== uid && ctx.mutedIds.has(row.authorId)) return false;
  if (row.spaceId && !ctx.spaceIds.has(row.spaceId) && row.authorId !== uid) return false;
  if (row.groupId && !ctx.groupIds.has(row.groupId) && row.authorId !== uid) return false;
  return true;
}

async function computeFeatured({ prisma, ctx }) {
  const { spaceIdParam, groupIdParam } = ctx;
  const scope = {};
  if (spaceIdParam) scope.spaceId = spaceIdParam;
  if (groupIdParam) scope.groupId = groupIdParam;

  // Curated: everything a moderator pinned (pinnedAt desc keeps the newest first).
  const curated = await prisma.post.findMany({
    where: { ...scope, pinned: true },
    orderBy: [{ pinnedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: 3,
  });

  // Automatic: engagement-weighted "hot" posts from the last 7 days.
  const since = new Date(Date.now() - FEATURED_HOT_WINDOW_MS);
  const candidates = await prisma.post.findMany({
    where: { ...scope, pinned: false, createdAt: { gte: since } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: FEATURED_CANDIDATE_CAP,
  });

  const now = Date.now();
  const hot = candidates
    .map((row) => ({ row, raw: engagementRaw(row) }))
    .filter(({ raw }) => raw >= FEATURED_MIN_ENGAGEMENT)
    .map(({ row, raw }) => {
      const createdAt = row.createdAt?.getTime?.() || Number(row.createdAt) || 0;
      const ageHours = Math.max(0, (now - createdAt) / 3600000);
      return { row, hot: raw / Math.pow(ageHours + 2, 0.9) };
    })
    .sort((a, b) => b.hot - a.hot)
    .slice(0, FEATURED_MAX);

  const rows = [...curated];
  const seen = new Set(rows.map((row) => row.id));
  for (const { row } of hot) {
    if (seen.has(row.id)) continue;
    rows.push(row);
    seen.add(row.id);
    if (rows.length >= FEATURED_MAX) break;
  }

  return rows.filter((row) => isFeaturedVisible(row, ctx)).map(mapPostRow);
}

// Attach space/group display names to mapped posts in a couple of batched
// queries so the client can render "in {SpaceName}" attribution without
// denormalizing columns onto Post.
async function attachAttribution({ prisma, posts }) {
  if (!posts || posts.length === 0) return posts;
  const spaceIds = [...new Set(posts.map((p) => p.spaceId).filter(Boolean))];
  const groupIds = [...new Set(posts.map((p) => p.groupId).filter(Boolean))];

  const [spaces, groups] = await Promise.all([
    spaceIds.length
      ? prisma.space.findMany({ where: { id: { in: spaceIds } }, select: { id: true, name: true, slug: true } })
      : [],
    groupIds.length
      ? prisma.group.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true, slug: true } })
      : [],
  ]);

  const spaceMap = new Map(spaces.map((s) => [s.id, s]));
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  for (const post of posts) {
    const space = post.spaceId ? spaceMap.get(post.spaceId) : null;
    const group = post.groupId ? groupMap.get(post.groupId) : null;
    if (space) {
      post.spaceName = space.name;
      post.spaceSlug = space.slug;
    }
    if (group) {
      post.groupName = group.name;
      post.groupSlug = group.slug;
    }
  }
  return posts;
}

export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const url = new URL(req.url);
  const followingOnly = url.searchParams.get("following") === "1";
  const nearOnly = url.searchParams.get("near") === "1";
  const spaceIdParam = url.searchParams.get("spaceId") || "";
  const groupIdParam = url.searchParams.get("groupId") || "";
  const filterType = url.searchParams.get("filter") || "";
  const sort = url.searchParams.get("sort") || "newest";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 50);

  const ctx = {
    followingOnly: followingOnly || filterType === "following",
    nearOnly: nearOnly || filterType === "near",
    spaceIdParam,
    groupIdParam,
    uid: user.uid,
    followingIds: new Set(),
    nearIds: new Set([user.uid]),
    spaceIds: new Set(),
    groupIds: new Set(),
    blockedIds: new Set(),
    mutedIds: new Set(),
    filterType: ["mine", "bookmarked", "hosts", "unanswered", "popular"].includes(filterType) ? filterType : "",
    searchText: q,
  };

  try {
    const prisma = getPrisma();
    const orderBy = feedOrderBy();

    const countryRow = await prisma.user.findUnique({
      where: { id: user.uid },
      select: { country: true },
    });
    const myCountry = countryRow?.country || "";

    const userDoc = await getUserDoc(user.uid);
    const blockedFromExtra = idsFromExtra(userDoc?.extra, "blockedMemberIds");
    const mutedFromExtra = idsFromExtra(userDoc?.extra, "mutedMemberIds");
    blockedFromExtra.forEach((id) => ctx.blockedIds.add(id));
    mutedFromExtra.forEach((id) => ctx.mutedIds.add(id));

    const [spaceRows, groupRows, followRows, nearRows] = await Promise.all([
      prisma.spaceMember.findMany({ where: { userId: user.uid }, select: { spaceId: true } }),
      prisma.groupMember.findMany({ where: { userId: user.uid }, select: { groupId: true } }),
      (ctx.followingOnly || filterType === "following")
        ? prisma.follow.findMany({ where: { followerId: user.uid }, select: { followingId: true } })
        : Promise.resolve([]),
      (ctx.nearOnly || filterType === "near") && myCountry
        ? prisma.user.findMany({ where: { country: myCountry }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    spaceRows.forEach((r) => r.spaceId && ctx.spaceIds.add(r.spaceId));
    groupRows.forEach((r) => r.groupId && ctx.groupIds.add(r.groupId));
    followRows.forEach((r) => r.followingId && ctx.followingIds.add(r.followingId));
    nearRows.forEach((r) => r.id && ctx.nearIds.add(r.id));

    const isChronological = sort === "newest";
    const needsOffset = !isChronological;
    const SCAN_CAP = needsOffset ? 600 : limit * 6;

    let visible = [];
    let afterKey = decodeCursor(url.searchParams.get("after") || "") || null;
    const isOffsetCursor = afterKey && typeof afterKey.o === "number";
    let offsetStart = isOffsetCursor ? afterKey.o : 0;
    let reachedEnd = false;
    let scanned = 0;
    const MAX_PASSES = Math.ceil(SCAN_CAP / 60) + 2;
    const PASS_TAKE = 60;

    while (visible.length < SCAN_CAP && !reachedEnd && scanned < MAX_PASSES * PASS_TAKE) {
      const cursorWhere = isChronological ? cursorAfter(isOffsetCursor ? null : afterKey) : undefined;
      const batch = await prisma.post.findMany({
        where: cursorWhere,
        orderBy,
        take: PASS_TAKE,
      });
      if (!batch.length) {
        reachedEnd = true;
        break;
      }
      scanned += batch.length;
      if (isChronological && !isOffsetCursor) {
        const lastRow = batch[batch.length - 1];
        afterKey = { pinned: !!lastRow.pinned, createdAt: lastRow.createdAt, id: lastRow.id };
      }
      for (const row of batch) {
        if (filterVisiblePosts([row], ctx).length) visible.push(row);
        if (visible.length >= SCAN_CAP) break;
      }
    }

    if (sort === "oldest") {
      visible.sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const at = Number(a.createdAt) || 0;
        const bt = Number(b.createdAt) || 0;
        return at - bt;
      });
    } else if (sort === "top") {
      visible.sort((a, b) => {
        const al = a.likes ? Object.keys(a.likes).length : 0;
        const bl = b.likes ? Object.keys(b.likes).length : 0;
        return bl - al;
      });
    } else if (sort === "activity") {
      visible.sort((a, b) => {
        const at = Number(a.lastActivityAt) || Number(a.createdAt) || 0;
        const bt = Number(b.lastActivityAt) || Number(b.createdAt) || 0;
        return bt - at;
      });
    } else if (sort === "popular") {
      visible = visible.filter((p) => p.likes && Object.keys(p.likes).length > 0);
      visible.sort((a, b) => {
        const al = Object.keys(a.likes || {}).length;
        const bl = Object.keys(b.likes || {}).length;
        return bl - al;
      });
    }

    const loadCounts = !afterKey;
    let counts = null;
    let featured = [];
    if (loadCounts) {
      try {
        counts = await computeFeedCounts({ prisma, ctx, orderBy, PASS_TAKE });
      } catch (err) {
        logError("posts.feed_counts_failed", { error: err.message });
        counts = null;
      }
      try {
        featured = await computeFeatured({ prisma, ctx });
      } catch (err) {
        logError("posts.feed_featured_failed", { error: err.message });
        featured = [];
      }
    }

    const paginated = needsOffset
      ? visible.slice(offsetStart, offsetStart + limit + 1)
      : visible.slice(0, limit + 1);

    const hasMore = paginated.length >= limit + 1;
    const posts = await attachAttribution({
      prisma,
      posts: paginated.slice(0, limit).map(mapPostRow),
    });

    let nextCursor = null;
    if (hasMore) {
      if (needsOffset) {
        nextCursor = encodeCursor({ pinned: false, createdAt: 0, id: "", o: offsetStart + limit });
      } else {
        const lastVisible = posts[posts.length - 1];
        const origLast = paginated[Math.min(limit, paginated.length) - 1];
        nextCursor = encodeCursor({ pinned: !!origLast.pinned, createdAt: origLast.createdAt, id: origLast.id });
      }
    }

    return NextResponse.json({ posts, nextCursor, hasMore, counts, featured });
  } catch (err) {
    logError("posts.prisma_feed_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
  }
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userDoc = await getUserDoc(user.uid);
  const caps = await getCapabilities(user.uid);
  if (!canWriteChat(caps) && !(userDoc?.role === "owner" || userDoc?.role === "moderator")) {
    return NextResponse.json({ error: "Live interaction requires an active membership" }, { status: 403 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const limited = rateLimitGuard(`feed-post:${user.uid}`, { limit: 10 });
  if (limited) return limited;

  const {
    text,
    imageUrl = "",
    groupId = "",
    spaceId = "",
    kind = "post",
    pollOptions = [],
    pollDeadline = "",
  } = await req.json();

  let cleanText = typeof text === "string" ? text.trim() : "";
  const postKind = ["post", "poll", "question", "win"].includes(kind) ? kind : "post";
  if (postKind === "poll") {
    const cleanOptions = (Array.isArray(pollOptions) ? pollOptions : [])
      .map((opt) => (typeof opt === "string" ? opt.trim() : ""))
      .filter((opt) => opt.length > 0 && opt.length <= 100);
    if (cleanOptions.length < 2 || cleanOptions.length > 5) {
      return NextResponse.json({ error: "Polls need 2-5 options" }, { status: 400 });
    }
    if (pollDeadline) {
      const deadlineDate = new Date(pollDeadline);
      if (isNaN(deadlineDate.getTime()) || deadlineDate.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Poll deadline must be a valid future date" }, { status: 400 });
      }
    }
  } else {
    if (!cleanText && !imageUrl) {
      return NextResponse.json({ error: "Post text required" }, { status: 400 });
    }
    if (cleanText) {
      const check = validatePostText(cleanText);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      cleanText = check.text;
    }
  }

  if (cleanText.length > POST_TEXT_MAX) {
    return NextResponse.json(
      { error: `Post text too long (max ${POST_TEXT_MAX} characters)` },
      { status: 400 }
    );
  }

  if (imageUrl && !isValidImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  const authorName = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";
  const authorRole = userDoc?.role || "member";
  const prisma = getPrisma();

  let spaceSlug = "";
  let spaceName = "";
  if (spaceId) {
    const space = await getSpace(spaceId);
    if (!space || space.status !== "active" || !(space.features || {}).feed) {
      return NextResponse.json({ error: "Space not found" }, { status: 404 });
    }
    const isOwner = userDoc?.role === "owner";
    const membership = await isSpaceMember(spaceId, user.uid);
    if (!membership && !isOwner) {
      return NextResponse.json({ error: "Join the space first" }, { status: 403 });
    }
    spaceSlug = space.slug;
    spaceName = space.name;
  }

  if (groupId) {
    try {
      const groupRow = await prisma.group.findUnique({
        where: { id: groupId },
        select: { status: true },
      });
      if (!groupRow || groupRow.status !== "active") {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      const memberRow = await prisma.groupMember.findUnique({
        where: { id: `${groupId}_${user.uid}` },
        select: { id: true },
      });
      if (!memberRow) {
        return NextResponse.json({ error: "Join the group first" }, { status: 403 });
      }
    } catch (err) {
      logError("posts.prisma_group_check_failed", { error: err.message });
      return NextResponse.json({ error: "Failed to validate group" }, { status: 500 });
    }
  }

  let postId = null;
  try {
    const prismaData = {
      authorId: user.uid,
      authorName,
      authorRole,
      text: cleanText,
      likes: {},
      pinned: false,
      kind: postKind,
      hashtags: extractHashtags(cleanText),
      bookmarks: {},
      commentCount: 0,
      lastActivityAt: new Date(),
    };
    if (imageUrl && typeof imageUrl === "string") {
      prismaData.imageUrl = imageUrl;
    }
    if (spaceId) prismaData.spaceId = spaceId;
    if (groupId) prismaData.groupId = groupId;
    if (postKind === "poll") {
      prismaData.pollOptions = (Array.isArray(pollOptions) ? pollOptions : [])
        .map((opt) => (typeof opt === "string" ? opt.trim() : ""))
        .filter((opt) => opt.length > 0)
        .slice(0, 5);
      prismaData.pollCounts = {};
      prismaData.pollTotal = 0;
      if (pollDeadline) {
        prismaData.pollDeadline = new Date(pollDeadline);
      }
    }
    const post = await prisma.post.create({ data: prismaData });
    postId = post.id;
  } catch (err) {
    logError("posts.prisma_create_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }

  const mentionUsernames = extractMentions(cleanText);
  if (mentionUsernames.length > 0) {
    resolveMentions(mentionUsernames).then((mentions) =>
      sendMentionNotifications({
        mentions,
        actorId: user.uid,
        actorName: authorName,
        targetId: postId,
        href: spaceId ? `/spaces/${spaceSlug}` : `/feed`,
        text: "post",
      })
    ).catch((err) => {
      logError("mention.notify_failed", { uid: user.uid, postId, error: err.message });
    });
  }

  runAutomations("new_post", {
    authorName,
    authorUid: user.uid,
    postText: cleanText.slice(0, 200),
    postKind,
    postId,
    subjectUid: user.uid,
    subjectName: authorName,
  }).catch((err) => {
    logError("automation.new_post_failed", { uid: user.uid, postId, error: err.message });
  });

  const postCount = await prisma.post
    .count({ where: { authorId: user.uid } })
    .catch((err) => {
      logError("posts.prisma_count_failed", { uid: user.uid, error: err.message });
      return 0;
    });
  await awardPoints(user.uid, POINTS.POST, authorName).catch((err) => {
    logError("gamification.post_failed", { uid: user.uid, postId, error: err.message });
  });
  await awardBadge(user.uid, "first_post", authorName).catch((err) => {
    logError("gamification.badge_failed", { uid: user.uid, postId, error: err.message });
  });
  if (postCount >= 10)
    await awardBadge(user.uid, "ten_posts", authorName).catch((err) => {
      logError("gamification.badge_failed", { uid: user.uid, postId, error: err.message });
    });
  if (postCount >= 50)
    await awardBadge(user.uid, "fifty_posts", authorName).catch((err) => {
      logError("gamification.badge_failed", { uid: user.uid, postId, error: err.message });
    });

  if (spaceId) {
    try {
      const members = await prisma.spaceMember.findMany({
        where: { spaceId },
        take: 100,
        select: { userId: true },
      });
      for (const member of members) {
        const memberId = member.userId;
        if (memberId === user.uid) continue;
        await createNotification({
          userId: memberId,
          type: "space_activity",
          actorId: user.uid,
          actorName: authorName,
          text: "posted in " + (spaceName || "a space"),
          href: `/spaces/${spaceSlug}`,
        });
      }
    } catch (err) {
      logError("posts.prisma_space_members_failed", { error: err.message });
    }
  }

  return NextResponse.json({ id: postId });
}