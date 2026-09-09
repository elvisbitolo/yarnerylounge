import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { mapGamificationRow, mapLeaderboardRow } from "./gamification-core.js";

export const POINTS = {
  POST: 10,
  COMMENT: 5,
  LESSON: 15,
  RSVP: 5,
  DAILY_VISIT: 10,
  BADGE_BONUS: 20,
};

export const BADGES = {
  welcome: { name: "Welcome", description: "Joined the community" },
  first_post: { name: "First Post", description: "Published your first post" },
  ten_posts: { name: "10 Posts", description: "Published 10 posts" },
  fifty_posts: { name: "50 Posts", description: "Published 50 posts" },
  first_comment: { name: "First Comment", description: "Commented on a post" },
  streak_3: { name: "3 Day Streak", description: "Visited 3 days in a row" },
  streak_7: { name: "7 Day Streak", description: "Visited 7 days in a row" },
  streak_30: { name: "30 Day Streak", description: "Visited 30 days in a row" },
  course_complete: { name: "Course Completed", description: "Finished a course" },
};

function todayKey(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function getGamification(uid) {
  try {
    const prisma = getPrisma();
    if (!prisma) return null;
    const row = await prisma.gamification.findFirst({
      where: { OR: [{ id: uid }, { userId: uid }] },
    });
    return row ? mapGamificationRow(row) : null;
  } catch (err) {
    logError("gamification.prisma_read_failed", { error: err.message });
    return null;
  }
}

export async function getLeaderboard(limit = 20) {
  try {
    const prisma = getPrisma();
    if (!prisma) return [];
    const rows = await prisma.gamification.findMany({
      orderBy: { points: "desc" },
      take: limit,
    });
    return rows.map(mapLeaderboardRow);
  } catch (err) {
    logError("gamification.prisma_leaderboard_failed", { error: err.message });
    return [];
  }
}

export async function awardPoints(uid, amount, name) {
  try {
    const prisma = getPrisma();
    if (!prisma) return;
    const row = await prisma.gamification.findFirst({
      where: { OR: [{ id: uid }, { userId: uid }] },
    });
    if (!row) {
      await prisma.gamification.create({
        data: {
          id: uid,
          userId: uid,
          points: amount,
          streak: 0,
          bestStreak: 0,
          badges: {},
          lastVisitDate: "",
          recentVisits: [],
          name: name || "Member",
        },
      });
      return;
    }
    await prisma.gamification.update({
      where: { id: row.id },
      data: { points: Math.max(0, (row.points || 0) + amount) },
    });
  } catch (err) {
    logError("gamification.award_points_failed", { error: err.message });
  }
}

export async function awardBadge(uid, code, name) {
  const meta = BADGES[code];
  if (!meta) return;
  try {
    const prisma = getPrisma();
    if (!prisma) return;
    const row = await prisma.gamification.findFirst({
      where: { OR: [{ id: uid }, { userId: uid }] },
    });
    if (!row) {
      await prisma.gamification.create({
        data: {
          id: uid,
          userId: uid,
          points: POINTS.BADGE_BONUS,
          streak: 0,
          bestStreak: 0,
          badges: { [code]: { name: meta.name, earnedAt: new Date() } },
          lastVisitDate: "",
          recentVisits: [],
          name: name || "Member",
        },
      });
      return;
    }
    const badges =
      row.badges && typeof row.badges === "object" ? { ...row.badges } : {};
    if (badges[code]) return;
    badges[code] = { name: meta.name, earnedAt: new Date() };
    await prisma.gamification.update({
      where: { id: row.id },
      data: {
        badges,
        points: (row.points || 0) + POINTS.BADGE_BONUS,
      },
    });
  } catch (err) {
    logError("gamification.award_badge_failed", { error: err.message });
  }
}

export async function recordDailyVisit(uid, name) {
  const now = todayKey();
  try {
    const prisma = getPrisma();
    if (!prisma) return;
    const row = await prisma.gamification.findFirst({
      where: { OR: [{ id: uid }, { userId: uid }] },
    });
    if (!row) {
      await prisma.gamification.create({
        data: {
          id: uid,
          userId: uid,
          points: POINTS.DAILY_VISIT,
          streak: 1,
          bestStreak: 1,
          badges: {},
          lastVisitDate: now,
          recentVisits: [],
          name: name || "Member",
        },
      });
      return;
    }
    if (row.lastVisitDate === now) return;

    let streak = row.streak || 0;
    if (row.lastVisitDate === todayKey(1)) {
      streak += 1;
    } else {
      streak = 1;
    }
    const bestStreak = Math.max(row.bestStreak || 0, streak);
    const recentVisits = [
      ...(Array.isArray(row.recentVisits) ? row.recentVisits : []),
      now,
    ]
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(-7);
    const badges =
      row.badges && typeof row.badges === "object" ? { ...row.badges } : {};
    const newBadges = {};
    if (streak >= 3 && !badges.streak_3)
      newBadges.streak_3 = { name: BADGES.streak_3.name, earnedAt: new Date() };
    if (streak >= 7 && !badges.streak_7)
      newBadges.streak_7 = { name: BADGES.streak_7.name, earnedAt: new Date() };
    if (streak >= 30 && !badges.streak_30)
      newBadges.streak_30 = { name: BADGES.streak_30.name, earnedAt: new Date() };

    await prisma.gamification.update({
      where: { id: row.id },
      data: {
        streak,
        bestStreak,
        lastVisitDate: now,
        recentVisits,
        points:
          (row.points || 0) +
          POINTS.DAILY_VISIT +
          Object.keys(newBadges).length * POINTS.BADGE_BONUS,
        badges: { ...badges, ...newBadges },
        name: name || row.name || "Member",
      },
    });
  } catch (err) {
    logError("gamification.record_daily_visit_failed", { error: err.message });
  }
}
