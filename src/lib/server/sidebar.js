import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getGamification, getLeaderboard } from "@/lib/server/gamification";
import { startOfDay, visitKey } from "@/lib/server/analytics-core";
import { STREAK_TARGETS, getNextMilestone } from "@/lib/server/sidebar-core";

const CONTRIBUTOR_LIMIT = 8;
const RECOMMEND_LIMIT = 4;

function windowDays(period) {
  if (period === "week") return 7;
  if (period === "month") return 30;
  return 1;
}

async function loadContributors(uid, period) {
  const since = startOfDay(windowDays(period));
  const sinceDate = new Date(since);

  const prisma = getPrisma();
  let activeIds = new Set();

  if (prisma) {
    try {
      const [postRows, commentRows, gamiRows] = await Promise.all([
        prisma.post.findMany({
          where: { createdAt: { gte: sinceDate } },
          select: { authorId: true },
          take: 500,
        }),
        prisma.postComment.findMany({
          where: { createdAt: { gte: sinceDate } },
          select: { authorId: true },
          take: 1000,
        }),
        prisma.gamification.findMany({
          where: { lastVisitDate: { gte: visitKey(Math.max(0, windowDays(period) - 1)) } },
          select: { id: true },
          take: 400,
        }),
      ]);
      for (const row of postRows) {
        if (row.authorId) activeIds.add(row.authorId);
      }
      for (const row of commentRows) {
        if (row.authorId) activeIds.add(row.authorId);
      }
      for (const row of gamiRows) {
        if (row.id) activeIds.add(row.id);
      }
    } catch (err) {
      logError("sidebar.prisma_contributors_failed", { error: err.message });
      activeIds = new Set();
    }
  }

  const idList = [...activeIds].filter((id) => id && id !== uid).slice(0, 60);
  if (idList.length === 0) return [];

  const gamiData = [];
  if (prisma) {
    try {
      const rows = await prisma.gamification.findMany({
        where: { id: { in: idList } },
        select: { id: true, points: true },
      });
      gamiData.push(...rows.map((r) => ({ id: r.id, points: Number(r.points) || 0 })));
    } catch (err) {
      logError("sidebar.prisma_gami_scored_failed", { error: err.message });
    }
  }

  const scored = gamiData
    .sort((a, b) => b.points - a.points)
    .slice(0, CONTRIBUTOR_LIMIT);

  const userMap = new Map();
  if (prisma) {
    try {
      const userIds = scored.map((e) => e.id);
      if (userIds.length) {
        const userRows = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, username: true, photoURL: true },
        });
        for (const row of userRows) userMap.set(row.id, row);
      }
    } catch (err) {
      logError("sidebar.prisma_users_scored_failed", { error: err.message });
    }
  }

  return scored.map((entry, index) => {
    const user = userMap.get(entry.id) || {};
    return {
      id: entry.id,
      name: user.name || "Member",
      username: user.username || "",
      photoURL: user.photoURL || "",
      points: entry.points,
      rank: index + 1,
    };
  });
}

async function loadRecommended(uid, contributors) {
  const picks = contributors.filter((c) => c.id !== uid).slice(0, RECOMMEND_LIMIT);
  if (picks.length >= RECOMMEND_LIMIT) return picks;

  const existing = new Set([uid, ...picks.map((c) => c.id)]);
  const extraIds = [];

  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.gamification.findMany({
        orderBy: { points: "desc" },
        take: 30,
        select: { id: true, points: true },
      });
      for (const row of rows) {
        if (!existing.has(row.id)) {
          extraIds.push(row.id);
          if (extraIds.length >= RECOMMEND_LIMIT - picks.length) break;
        }
      }
    } catch (err) {
      logError("sidebar.prisma_recommended_failed", { error: err.message });
    }
  }
  if (extraIds.length === 0) {
    const leaderboard = await getLeaderboard(30);
    for (const entry of leaderboard) {
      const id = entry.userId;
      if (!existing.has(id)) {
        extraIds.push(id);
        if (extraIds.length >= RECOMMEND_LIMIT - picks.length) break;
      }
    }
  }

  const userMap = new Map();
  const gamiMap = new Map();
  if (prisma) {
    try {
      if (extraIds.length) {
        const [userRows, gamiRows] = await Promise.all([
          prisma.user.findMany({
            where: { id: { in: extraIds } },
            select: { id: true, name: true, username: true, photoURL: true },
          }),
          prisma.gamification.findMany({
            where: { id: { in: extraIds } },
            select: { id: true, points: true },
          }),
        ]);
        for (const row of userRows) userMap.set(row.id, row);
        for (const row of gamiRows) gamiMap.set(row.id, row);
      }
    } catch (err) {
      logError("sidebar.prisma_recommended_users_failed", { error: err.message });
    }
  }

  for (const id of extraIds) {
    const user = userMap.get(id);
    if (!user?.name) continue;
    const gData = gamiMap.get(id);
    picks.push({
      id,
      name: user.name,
      username: user.username || "",
      photoURL: user.photoURL || "",
      points: Number(gData?.points) || 0,
      rank: 0,
    });
  }
  return picks.slice(0, RECOMMEND_LIMIT);
}

export async function getSidebarData(uid, period = "day") {
  const gami = await getGamification(uid);
  const streak = Number(gami.streak) || 0;

  const since = startOfDay(1);
  const sinceDate = new Date(since);

  const prisma = getPrisma();
  let onlineUids = new Set();
  let newToday = 0;
  let postsToday = 0;
  let commentsToday = 0;

  if (prisma) {
    try {
      [onlineUids, newToday, postsToday, commentsToday] = await Promise.all([
        new Set(),
        prisma.user.count({ where: { createdAt: { gte: sinceDate } } }),
        prisma.post.count({ where: { createdAt: { gte: sinceDate } } }),
        prisma.postComment.count({ where: { createdAt: { gte: sinceDate } } }),
      ]);
    } catch (err) {
      logError("sidebar.prisma_counts_failed", { error: err.message });
    }
  }

  const milestone = getNextMilestone(streak);

  const contributors = await loadContributors(uid, period);
  const recommended = await loadRecommended(uid, contributors);

  return {
    streak,
    bestStreak: Number(gami.bestStreak) || 0,
    points: Number(gami.points) || 0,
    nextMilestone: milestone,
    activity: {
      onlineNow: onlineUids.size,
      newToday,
      postsToday,
      commentsToday,
    },
    contributors,
    recommended,
  };
}
