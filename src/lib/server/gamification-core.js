// Pure helpers for the gamification storage cutover — no I/O, unit-testable.
// See gamification.js for the storage layer (Prisma-backed).

export function mapGamificationRow(row) {
  if (!row) return null;
  return {
    points: row.points || 0,
    streak: row.streak || 0,
    bestStreak: row.bestStreak || 0,
    badges: row.badges && typeof row.badges === "object" ? row.badges : {},
    lastVisitDate: row.lastVisitDate || "",
    recentVisits: Array.isArray(row.recentVisits) ? row.recentVisits : [],
    name: row.name || "Member",
  };
}

export function mapLeaderboardRow(row, index) {
  return {
    userId: row.id,
    name: row.name || "Member",
    points: row.points || 0,
    streak: row.streak || 0,
    badgeCount:
      row.badges && typeof row.badges === "object" ? Object.keys(row.badges).length : 0,
    rank: index + 1,
  };
}