import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { mapUserRow, mapLeaderboardMemberRow } from "./members-core.js";

function gamiOf(row) {
  return row.gamification ? row.gamification : null;
}

export async function listMembers(limit = 300) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.user.findMany({
        where: { suspended: { not: true } },
        orderBy: { name: "asc" },
        take: limit,
        include: { gamification: { select: { points: true, badges: true } } },
      });
      return rows.map((row) => {
        const u = mapUserRow(row);
        const g = gamiOf(row);
        return {
          ...u,
          points: g?.points || 0,
          badgeCount:
            g?.badges && typeof g.badges === "object" ? Object.keys(g.badges).length : 0,
          lastVisitDate: g?.lastVisitDate || "",
        };
      });
    } catch (err) {
      logError("members.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function getLeaderboard(limit = 20) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.gamification.findMany({
        where: { points: { gt: 0 } },
        orderBy: { points: "desc" },
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, photoURL: true, role: true, plan: true },
          },
        },
      });
      return rows.map((row, index) => {
        const u = row.user || {};
        return {
          userId: row.id,
          name: u.name || "Member",
          photoURL: u.photoURL || "",
          role: u.role || "member",
          plan: u.plan || "flirting",
          points: row.points || 0,
          badgeCount:
            row.badges && typeof row.badges === "object" ? Object.keys(row.badges).length : 0,
          rank: index + 1,
        };
      });
    } catch (err) {
      logError("members.prisma_leaderboard_failed", { error: err.message });
    }
  }
  return [];
}
