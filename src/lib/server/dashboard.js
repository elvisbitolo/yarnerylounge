import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { listRooms } from "@/lib/server/rooms";
import { listEvents, expandEvents } from "@/lib/server/events";
import { getCourse, getCourseFull, getProgress } from "@/lib/server/courses";
import { listSpaces } from "@/lib/server/spaces";
import { listConversations } from "@/lib/server/chat";
import { listNotifications } from "@/lib/server/notifications";
import { getLeaderboard } from "@/lib/server/gamification";

function toMillis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  return new Date(value).getTime();
}

function isUpcoming(event, now = Date.now()) {
  return toMillis(event.startTime) > now;
}

export async function getUserMemberships(uid) {
  try {
    const prisma = getPrisma();
    if (!prisma) return { spaceIds: new Set(), groupIds: new Set() };
    const [spaceRows, groupRows] = await Promise.all([
      prisma.spaceMember.findMany({ where: { userId: uid }, select: { spaceId: true } }),
      prisma.groupMember.findMany({ where: { userId: uid }, select: { groupId: true } }),
    ]);
    return {
      spaceIds: new Set(spaceRows.map((r) => r.spaceId)),
      groupIds: new Set(groupRows.map((r) => r.groupId)),
    };
  } catch (err) {
    logError("dashboard.prisma_memberships_failed", { error: err.message });
    return { spaceIds: new Set(), groupIds: new Set() };
  }
}

function canReadPostServer(post, uid, role, memberships) {
  if (role === "owner" || post.authorId === uid) return true;
  if (post.spaceId && !memberships.spaceIds.has(post.spaceId)) return false;
  if (post.groupId && !memberships.groupIds.has(post.groupId)) return false;
  return true;
}

export async function getCommunityActivity(uid, role, memberships, limit = 5) {
  let rows;
  try {
    const prisma = getPrisma();
    if (!prisma) rows = [];
    else {
      rows = await prisma.post.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    }
  } catch (err) {
    logError("dashboard.prisma_activity_failed", { error: err.message });
    rows = [];
  }

  const firestorePosts = rows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorName: r.authorName || "Member",
    text: r.text || "",
    kind: r.kind || "post",
    spaceId: r.spaceId || "",
    groupId: r.groupId || "",
    createdAt: toMillis(r.createdAt),
  }));

  const posts = [];
  const spaceIds = new Set();
  const groupIds = new Set();
  const visible = [];
  for (const post of firestorePosts) {
    if (!canReadPostServer(post, uid, role, memberships)) continue;
    visible.push(post);
    if (post.spaceId) spaceIds.add(post.spaceId);
    if (post.groupId) groupIds.add(post.groupId);
  }

  const [spaceSlugs, groupSlugs] = await Promise.all([
    (async () => {
      const map = new Map();
      if (!spaceIds.size) return map;
      try {
        const prisma = getPrisma();
        if (!prisma) return map;
        const rows = await prisma.space.findMany({
          where: { id: { in: [...spaceIds] } },
          select: { id: true, slug: true },
        });
        for (const r of rows) map.set(r.id, r.slug || "");
      } catch (err) {
        logError("dashboard.prisma_space_slugs_failed", { error: err.message });
      }
      return map;
    })(),
    (async () => {
      const map = new Map();
      if (!groupIds.size) return map;
      try {
        const prisma = getPrisma();
        if (!prisma) return map;
        const rows = await prisma.group.findMany({
          where: { id: { in: [...groupIds] } },
          select: { id: true, slug: true },
        });
        for (const r of rows) map.set(r.id, r.slug || "");
      } catch (err) {
        logError("dashboard.prisma_group_slugs_failed", { error: err.message });
      }
      return map;
    })(),
  ]);

  for (const post of visible) {
    posts.push({
      id: post.id,
      text: post.text || "",
      authorName: post.authorName || "Member",
      kind: post.kind || "post",
      createdAt: toMillis(post.createdAt),
      href:
        post.spaceId && spaceSlugs.get(post.spaceId)
          ? `/spaces/${spaceSlugs.get(post.spaceId)}`
          : post.groupId && groupSlugs.get(post.groupId)
            ? `/groups/${groupSlugs.get(post.groupId)}`
            : "/feed",
    });
    if (posts.length >= limit) break;
  }
  return posts;
}

export async function getContinueLearning(uid, tier, limit = 3) {
  let progressRows;
  try {
    const prisma = getPrisma();
    if (!prisma) progressRows = [];
    else {
      const rows = await prisma.progress.findMany({
        where: { userId: uid },
        take: 50,
      });
      progressRows = rows.map((r) => ({
        courseId: r.courseId,
        completedLessons: r.completedLessons || [],
        updatedAt: toMillis(r.updatedAt),
      }));
    }
  } catch (err) {
    logError("dashboard.prisma_progress_failed", { error: err.message });
    progressRows = [];
  }

  const rows = [];
  for (const progress of progressRows) {
    const course = await getCourse(progress.courseId);
    if (!course || course.status !== "published") continue;
    const full = await getCourseFull(course.id);
    let total = 0;
    for (const mod of full.modules) {
      total += (full.lessons[mod.id] || []).length;
    }
    const done = progress.completedLessons.length;
    rows.push({
      id: course.id,
      title: course.title,
      done,
      total,
      pct: total ? Math.round((done / total) * 100) : 0,
      updatedAt: progress.updatedAt,
    });
  }
  return rows
    .filter((row) => row.done > 0)
    .sort((a, b) => b.updatedAt - (a.updatedAt || 0))
    .slice(0, limit);
}

export async function getRecommendedSpaces(uid, tier, memberships, limit = 3) {
  const spaces = await listSpaces();
  return spaces
    .filter(
      (space) =>
        !memberships.spaceIds.has(space.id) &&
        space.access !== "invite"
    )
    .slice(0, limit)
    .map((space) => ({
      id: space.id,
      slug: space.slug,
      name: space.name,
      description: space.description || "",
      memberCount: 0,
    }));
}

export async function getLiveRooms(limit = 3) {
  const rooms = await listRooms();
  return rooms
    .filter((room) => room.status === "active")
    .slice(0, limit)
    .map((room) => ({
      id: room.id,
      slug: room.slug,
      name: room.name,
      kind: room.kind || "standard",
      maxParticipants: Number(room.maxParticipants) || 0,
    }));
}

export async function getUpcomingEvents(limit = 3) {
  const events = await listEvents();
  const expanded = expandEvents(events)
    .filter(isUpcoming)
    .sort((a, b) => toMillis(a.startTime) - toMillis(b.startTime))
    .slice(0, limit);
  return expanded.map((event) => ({
    id: event.id,
    title: event.title,
    startTime: toMillis(event.startTime),
    roomSlug: event.roomSlug || "",
  }));
}

export async function getRecentMessages(uid, limit = 3) {
  const conversations = await listConversations(uid);
  return conversations.slice(0, limit).map((conv) => ({
    id: conv.id,
    title: conv?.title || conv?.name || "Chat",
    lastMessage: conv.lastMessage || "",
    updatedAt: conv.updatedAt || 0,
  }));
}

export async function getRecentNotifications(uid, limit = 5) {
  return (await listNotifications(uid, limit)).map((n) => ({
    id: n.id,
    text: n.text || "",
    href: n.href || "/notifications",
    read: !!n.read,
    createdAt: toMillis(n.createdAt),
  }));
}

export async function getDashboardData(uid, userDoc, tier) {
  const role = userDoc?.role || "member";
  const memberships = await getUserMemberships(uid);
  const [activity, learning, spaces, rooms, events, messages, notifications, leaderboard] =
    await Promise.all([
      getCommunityActivity(uid, role, memberships),
      getContinueLearning(uid, tier),
      getRecommendedSpaces(uid, tier, memberships),
      getLiveRooms(),
      getUpcomingEvents(),
      getRecentMessages(uid),
      getRecentNotifications(uid),
      getLeaderboard(3),
    ]);
  return { activity, learning, spaces, rooms, events, messages, notifications, leaderboard };
}
