import { getPrisma } from "@/lib/db/prisma";
import { canModerate } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";
import { listRooms } from "@/lib/server/rooms";
import { listEvents, expandEvents, listRsvps, getEvent } from "@/lib/server/events";
import { getCourse } from "@/lib/server/courses";
import { getSpace } from "@/lib/server/spaces";
import { listConversations } from "@/lib/server/chat";
import { listNotifications } from "@/lib/server/notifications";
import { getLeaderboard, getGamification } from "@/lib/server/gamification";
import { getUserMemberships } from "@/lib/server/dashboard";
import { getPerkTier } from "@/lib/server/perks";
import { logError } from "@/lib/server/log";
import {
  toMillis,
  startOfDay,
  visitKey,
  summarizeSubscriptions,
  summarizePurchases,
  rankTopPosts,
} from "@/lib/server/analytics-core";

function canReadPostServer(post, uid, role, memberships) {
  if (role === "owner" || post.authorId === uid) return true;
  if (post.spaceId && !memberships.spaceIds.has(post.spaceId)) return false;
  if (post.groupId && !memberships.groupIds.has(post.groupId)) return false;
  return true;
}

function serializeUserRow(row) {
  const data = row || {};
  return {
    id: data.id || "",
    name: data.name || "Member",
    email: data.email || "",
    role: data.role || "member",
    photoURL: data.photoURL || "",
    headline: data.headline || "",
    bio: data.bio || "",
    createdAt: toMillis(data.createdAt),
  };
}

async function listActiveRooms() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      return await prisma.room.findMany({ where: { status: "active" } });
    } catch (err) {
      logError("dashboard-command.prisma_rooms_failed", { error: err.message });
    }
  }
  return [];
}

async function computeLiveViewers(activeRoomList) {
  const { countActiveRoomMembers } = await import("./room-presence.js");
  return countActiveRoomMembers(activeRoomList.map((room) => room.id));
}

function loadPurchasePrice(data) {
  const loader =
    data.targetType === "course"
      ? getCourse
      : data.targetType === "event"
        ? getEvent
        : getSpace;
  return async () => {
    let priceCents = null;
    try {
      const item = await loader(data.targetId);
      priceCents = Number(item?.purchasePriceCents) || 0;
    } catch {
      priceCents = null;
    }
    return priceCents;
  };
}

async function computeRevenue(now, since30) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const [subs, purchases] = await Promise.all([
        prisma.subscription.findMany(),
        prisma.purchase.findMany({ where: { purchasedAt: { gte: new Date(since30) } } }),
      ]);
      const priceMap = {};
      const subsSummary = summarizeSubscriptions(subs, priceMap, now);
      const purchasesWithPrice = await Promise.all(
        purchases.map(async (p) => ({
          targetType: p.targetType,
          targetId: p.targetId,
          priceCents: await loadPurchasePrice(p)(),
        }))
      );
      const purchasesSummary = summarizePurchases(purchasesWithPrice);
      return {
        activeSubs: subsSummary.active,
        estMonthlyCents: subsSummary.estimatedMonthlyCents,
        revenue30Cents: purchasesSummary.revenueCents,
        purchases30: purchasesSummary.total,
      };
    } catch (err) {
      logError("dashboard-command.prisma_revenue_failed", { error: err.message });
    }
  }
  return null;
}

export async function getDashboardStats(uid, userDoc) {
  const isStaff = canModerate(userDoc);

  const now = Date.now();
  const since30 = startOfDay(30);

  const prisma = getPrisma();
  let membersTotal = 0;
  let newMembers30 = 0;
  let activeRoomList = [];
  let active7 = 0;
  if (prisma) {
    try {
      const [membersTotalRes, newMembers30Res, activeRoomsRes, active7Res] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: new Date(since30) } } }),
        prisma.room.findMany({ where: { status: "active" } }),
        prisma.gamification.count({ where: { lastVisitDate: { gte: visitKey(7) } } }),
      ]);
      membersTotal = membersTotalRes;
      newMembers30 = newMembers30Res;
      activeRoomList = activeRoomsRes;
      active7 = active7Res;
    } catch (err) {
      logError("dashboard-command.prisma_stats_failed", { error: err.message, uid });
    }
  }

  const liveViewers = await computeLiveViewers(activeRoomList);
  const revenue = isStaff ? await computeRevenue(now, since30) : null;
  const contributing = await countUsersContributing(since30);

  return {
    members: { total: membersTotal, new30: newMembers30 },
    live: { rooms: activeRoomList.length, viewers: liveViewers },
    revenue,
    engagement: { active7, contributing, contributionRate: membersTotal ? Math.round((contributing / membersTotal) * 100) : 0 },
  };
}

async function countUsersContributing(since) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.post.findMany({
        where: { createdAt: { gte: new Date(since) } },
        take: 1000,
      });
      return new Set(rows.map((p) => p.authorId).filter(Boolean)).size;
    } catch (err) {
      logError("dashboard-command.prisma_contributors_failed", { error: err.message });
    }
  }
  return 0;
}

export async function getAudienceSeries(days) {
  const start = startOfDay(days - 1);
  const end = startOfDay(0);
  const dayMs = 24 * 60 * 60 * 1000;

  const buckets = new Array(days).fill(0).map((_, i) => ({
    day: end - (days - 1 - i) * dayMs,
    membersNew: 0,
    activity: 0,
  }));
  const indexFor = (t) => {
    const i = Math.floor((t - start) / dayMs);
    return i >= 0 && i < days ? i : -1;
  };

  const startDate = new Date(start);
  const prisma = getPrisma();
  let membersBefore = 0;
  const accumulate = (users, posts, comments) => {
    users.forEach((doc) => {
      const i = indexFor(toMillis(doc.createdAt));
      if (i >= 0) buckets[i].membersNew += 1;
    });
    posts.forEach((doc) => {
      const i = indexFor(toMillis(doc.createdAt));
      if (i >= 0) buckets[i].activity += 1;
    });
    comments.forEach((doc) => {
      const i = indexFor(toMillis(doc.createdAt));
      if (i >= 0) buckets[i].activity += 1;
    });
  };
  if (prisma) {
    try {
      const [users, posts, comments, countBefore] = await Promise.all([
        prisma.user.findMany({ where: { createdAt: { gte: startDate } }, take: 3000 }),
        prisma.post.findMany({ where: { createdAt: { gte: startDate } }, take: 4000 }),
        prisma.postComment.findMany({ where: { createdAt: { gte: startDate } }, take: 5000 }),
        prisma.user.count({ where: { createdAt: { lt: startDate } } }),
      ]);
      membersBefore = countBefore;
      accumulate(users, posts, comments);
    } catch (err) {
      logError("dashboard-command.prisma_series_failed", { error: err.message });
    }
  }

  let running = membersBefore;
  const series = buckets.map((b) => {
    running += b.membersNew;
    return { day: b.day, members: running, membersNew: b.membersNew, activity: b.activity };
  });

  return { series, days, startTotal: membersBefore };
}

async function buildActivityItems(posts, users, rsvps, slugResolver, uid, role, memberships, limit) {
  const items = [];
  const visiblePosts = [];
  const spaceIds = new Set();
  const groupIds = new Set();

  for (const post of posts) {
    if (!canReadPostServer(post, uid, role, memberships)) continue;
    visiblePosts.push(post);
    if (post.spaceId) spaceIds.add(post.spaceId);
    if (post.groupId) groupIds.add(post.groupId);
  }

  const { spaceSlugs, groupSlugs } = await slugResolver(spaceIds, groupIds);

  for (const post of visiblePosts) {
    items.push({
      id: `post-${post.id}`,
      kind: "post",
      actor: post.authorName || "Member",
      text: (post.text || "").slice(0, 140),
      href:
        post.spaceId && spaceSlugs.get(post.spaceId)
          ? `/spaces/${spaceSlugs.get(post.spaceId)}`
          : post.groupId && groupSlugs.get(post.groupId)
            ? `/groups/${groupSlugs.get(post.groupId)}`
            : "/feed",
      createdAt: toMillis(post.createdAt),
    });
  }

  for (const user of users) {
    if (!user.createdAt) continue;
    items.push({
      id: `user-${user.id}`,
      kind: "signup",
      actor: user.name || "New member",
      text: "joined the community",
      href: "/members",
      createdAt: toMillis(user.createdAt),
    });
  }

  for (const rsvp of rsvps) {
    if (!rsvp.createdAt) continue;
    items.push({
      id: `rsvp-${rsvp.id}`,
      kind: "rsvp",
      actor: rsvp.name || "A member",
      text: "RSVP'd to an event",
      href: "/events",
      createdAt: toMillis(rsvp.createdAt),
    });
  }

  return items
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function getDashboardActivity(uid, role, memberships, limit = 8) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const [posts, users, rsvps] = await Promise.all([
        prisma.post.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
        prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
        prisma.rsvp.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
      ]);
      return buildActivityItems(
        posts,
        users,
        rsvps,
        async (spaceIds, groupIds) => {
          const [spaces, groups] = await Promise.all([
            spaceIds.size
              ? prisma.space.findMany({ where: { id: { in: [...spaceIds] } } })
              : Promise.resolve([]),
            groupIds.size
              ? prisma.group.findMany({ where: { id: { in: [...groupIds] } } })
              : Promise.resolve([]),
          ]);
          return {
            spaceSlugs: new Map(spaces.map((s) => [s.id, s.slug || ""])),
            groupSlugs: new Map(groups.map((g) => [g.id, g.slug || ""])),
          };
        },
        uid,
        role,
        memberships,
        limit
      );
    } catch (err) {
      logError("dashboard-command.prisma_activity_failed", { error: err.message, uid });
    }
  }
  return [];
}

export async function getDashboardUpcomingRooms(limit = 4) {
  const now = Date.now();
  const [rooms, events] = await Promise.all([listRooms(), listEvents()]);
  const upcomingEvents = expandEvents(events)
    .filter((event) => toMillis(event.startTime) > now)
    .sort((a, b) => toMillis(a.startTime) - toMillis(b.startTime))
    .slice(0, limit);

  const eventRsvpCounts = {};
  if (upcomingEvents.length > 0) {
    const lists = await Promise.all(upcomingEvents.map((event) => listRsvps(event.id)));
    upcomingEvents.forEach((event, i) => {
      eventRsvpCounts[event.id] = lists[i].length;
    });
  }

  const items = [];

  for (const room of rooms) {
    if (room.status === "active") {
      items.push({
        id: `live-${room.id}`,
        kind: "live",
        title: room.name || room.slug,
        slug: room.slug,
        startTime: null,
        rsvpCount: 0,
        href: `/rooms/${room.slug}`,
      });
    }
  }

  for (const event of upcomingEvents) {
    items.push({
      id: `event-${event.id}`,
      kind: "upcoming",
      title: event.title || "Upcoming event",
      slug: event.roomSlug || "",
      startTime: toMillis(event.startTime),
      rsvpCount: eventRsvpCounts[event.id] || 0,
      href: event.roomSlug ? `/rooms/${event.roomSlug}` : "/events",
    });
  }

  return items.slice(0, limit);
}

export async function getDashboardMessages(uid, limit = 5) {
  const conversations = await listConversations(uid);
  return conversations.slice(0, limit).map((conv) => ({
    id: conv.id,
    title: conv?.title || conv?.name || "Chat",
    lastMessage: (conv.lastMessage || "").slice(0, 100),
    lastMessageAt: conv.lastMessageAt || conv.updatedAt || 0,
  }));
}

export async function getDashboardNotifications(uid, limit = 6) {
  return (await listNotifications(uid, limit)).map((n) => ({
    id: n.id,
    text: n.text || "",
    href: n.href || "/notifications",
    read: !!n.read,
    createdAt: toMillis(n.createdAt),
  }));
}

function buildDashboardContent(posts, comments) {
  const commentCountByPost = {};
  comments.forEach((comment) => {
    if (comment.postId) {
      commentCountByPost[comment.postId] = (commentCountByPost[comment.postId] || 0) + 1;
    }
  });

  const top = rankTopPosts(
    posts.map((post) => ({ ...post, commentCount: commentCountByPost[post.id] || 0 }))
  );

  return {
    metric: "engagement",
    items: top.slice(0, 5).map((post) => ({
      id: post.id,
      title: post.text,
      authorName: post.authorName,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      score: post.score,
      href: "/feed",
    })),
  };
}

export async function getDashboardContent() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const [posts, comments] = await Promise.all([
        prisma.post.findMany({ orderBy: { createdAt: "desc" }, take: 120 }),
        prisma.postComment.findMany({ take: 3000 }),
      ]);
      return buildDashboardContent(posts, comments);
    } catch (err) {
      logError("dashboard-command.prisma_content_failed", { error: err.message });
    }
  }
  return { metric: "engagement", items: [] };
}

export async function getDashboardNeedsAttention(userDoc) {
  const isStaff = canModerate(userDoc);
  const items = [];

  if (isStaff) {
    let openReports = 0;
    let overdueQuestions = 0;
    const prisma = getPrisma();
    if (prisma) {
      try {
        [openReports, overdueQuestions] = await Promise.all([
          prisma.report.count({ where: { status: "open" } }),
          prisma.question.count({ where: { nextRun: { lte: new Date() } } }),
        ]);
      } catch (err) {
        logError("dashboard-command.prisma_needs_failed", { error: err.message });
      }
    }
    if (openReports > 0) {
      items.push({
        id: "reports",
        kind: "moderation",
        label: `${openReports} open ${openReports === 1 ? "report" : "reports"} need review`,
        href: "/admin/moderation",
      });
    }
    if (overdueQuestions > 0) {
      items.push({
        id: "questions",
        kind: "automation",
        label: `${overdueQuestions} scheduled ${overdueQuestions === 1 ? "question" : "questions"} are overdue`,
        href: "/admin/questions",
      });
    }
  }

  return items;
}

export async function getDashboardOnboarding(uid) {
  const [settings] = await Promise.all([getSettings()]);

  const prisma = getPrisma();
  let userRow = null;
  let hasPost = false;
  let hasRsvp = false;
  let hasRoomEvent = false;
  if (prisma) {
    try {
      const [u, post, rsvp, roomEvent] = await Promise.all([
        prisma.user.findUnique({ where: { id: uid } }),
        prisma.post.findFirst({ where: { authorId: uid } }),
        prisma.rsvp.findFirst({ where: { userId: uid } }),
        prisma.roomEvent.findFirst({ where: { userId: uid } }),
      ]);
      userRow = u;
      hasPost = !!post;
      hasRsvp = !!rsvp;
      hasRoomEvent = !!roomEvent;
    } catch (err) {
      logError("dashboard-command.prisma_onboarding_failed", { error: err.message, uid });
    }
  }

  const user = serializeUserRow(userRow);
  const steps = settings.welcomeChecklist || [];

  const profileDone = !!(user.bio || user.headline || user.location);
  const doneMap = { profile: profileDone, post: !!hasPost, rsvp: !!hasRsvp, room: !!hasRoomEvent };

  const doneCount = steps.filter((step) => doneMap[step.key]).length;

  return {
    steps,
    doneCount,
    total: steps.length,
    complete: steps.length > 0 && doneCount === steps.length,
  };
}

async function attempt(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err?.message || "Failed to load" };
  }
}

export async function getDashboardCommandData(uid, userDoc) {
  const role = userDoc?.role || "member";
  const memberships = await getUserMemberships(uid);
  const isStaff = canModerate(userDoc);
  const gamification = await getGamification(uid, userDoc?.name || "Member");
  const perkTier = await getPerkTier(uid);

  const user = {
    uid,
    name: userDoc?.name || userDoc?.displayName || "Member",
    email: userDoc?.email || "",
    role,
    photoURL: userDoc?.photoURL || "",
    points: Number(gamification.points) || 0,
    streak: Number(gamification.streak) || 0,
    membership: {
      tier: perkTier.tier,
      isStaff: perkTier.isStaff,
      isPlus: perkTier.isPlus,
      isHost: perkTier.isHost,
    },
  };

  const [stats, activity, upcomingRooms, messages, content, notifications, needsAttention, onboarding, leaderboard] =
    await Promise.all([
      attempt(() => getDashboardStats(uid, userDoc)),
      attempt(() => getDashboardActivity(uid, role, memberships)),
      attempt(() => getDashboardUpcomingRooms()),
      attempt(() => getDashboardMessages(uid)),
      attempt(() => getDashboardContent()),
      attempt(() => getDashboardNotifications(uid)),
      attempt(() => getDashboardNeedsAttention(userDoc)),
      attempt(() => getDashboardOnboarding(uid)),
      isStaff ? attempt(() => getLeaderboard(5)) : Promise.resolve({ ok: true, value: [] }),
    ]);

  return {
    user,
    isStaff,
    stats,
    activity,
    upcomingRooms,
    messages,
    content,
    notifications,
    needsAttention,
    onboarding,
    leaderboard,
  };
}
