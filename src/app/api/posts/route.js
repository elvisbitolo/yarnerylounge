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
import { validatePostText, isValidImageUrl, POST_TEXT_MAX, mapPostRow } from "@/lib/server/posts-core";

export const dynamic = "force-dynamic";

function filterVisiblePosts(posts, ctx) {
  const { followingOnly, nearOnly, spaceIdParam, groupIdParam, uid, followingIds, nearIds, spaceIds, groupIds } = ctx;
  return posts.filter((data) => {
    if (followingOnly && data.authorId !== uid && !followingIds.has(data.authorId)) return false;
    if (nearOnly && !nearIds.has(data.authorId)) return false;
    if (spaceIdParam && data.spaceId !== spaceIdParam) return false;
    if (groupIdParam && data.groupId !== groupIdParam) return false;
    if (data.spaceId && !spaceIds.has(data.spaceId) && data.authorId !== uid) return false;
    if (data.groupId && !groupIds.has(data.groupId) && data.authorId !== uid) return false;
    return true;
  });
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

  const ctx = {
    followingOnly,
    nearOnly,
    spaceIdParam,
    groupIdParam,
    uid: user.uid,
    followingIds: new Set(),
    nearIds: new Set([user.uid]),
    spaceIds: new Set(),
    groupIds: new Set(),
  };

  try {
    const prisma = getPrisma();
    const countryRow = await prisma.user.findUnique({
      where: { id: user.uid },
      select: { country: true },
    });
    const myCountry = countryRow?.country || "";
    const [spaceRows, groupRows, postRows, followRows, nearRows] = await Promise.all([
      prisma.spaceMember.findMany({ where: { userId: user.uid }, select: { spaceId: true } }),
      prisma.groupMember.findMany({ where: { userId: user.uid }, select: { groupId: true } }),
      prisma.post.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
      followingOnly
        ? prisma.follow.findMany({ where: { followerId: user.uid }, select: { followingId: true } })
        : Promise.resolve([]),
      nearOnly && myCountry
        ? prisma.user.findMany({ where: { country: myCountry }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    spaceRows.forEach((r) => r.spaceId && ctx.spaceIds.add(r.spaceId));
    groupRows.forEach((r) => r.groupId && ctx.groupIds.add(r.groupId));
    followRows.forEach((r) => r.followingId && ctx.followingIds.add(r.followingId));
    nearRows.forEach((r) => r.id && ctx.nearIds.add(r.id));
    const posts = postRows.map(mapPostRow);
    return NextResponse.json({ posts: filterVisiblePosts(posts, ctx) });
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