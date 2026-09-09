// Pure helpers for the user/members storage cutover — no I/O, unit-testable.
// See members.js for the storage layer (Prisma-first, Firestore fallback).

export function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    username: row.username || "",
    email: row.email || "",
    photoURL: row.photoURL || "",
    coverPhotoURL: row.coverPhotoURL || "",
    headline: row.headline || "",
    location: row.location || "",
    country: row.country || "",
    bio: row.bio || "",
    role: row.role || "member",
    roleLabel: row.roleLabel || "",
    plan: row.plan || "flirting",
    paymentStatus: row.paymentStatus || "unpaid",
    isPrePaid: row.isPrePaid || false,
    expiresAt: row.expiresAt ? new Date(row.expiresAt).getTime() : 0,
    crafts: Array.isArray(row.crafts) ? row.crafts : [],
    hobbies: Array.isArray(row.hobbies) ? row.hobbies : [],
    crochetTechniques: Array.isArray(row.crochetTechniques) ? row.crochetTechniques : [],
    favoriteHookSize: row.favoriteHookSize || "",
    favoriteColors: Array.isArray(row.favoriteColors) ? row.favoriteColors : [],
    skillLevel: row.skillLevel || "",
    foundingMember: row.foundingMember || false,
    suspended: row.suspended || false,
    createdAt: row.createdAt ? new Date(row.createdAt).getTime() : 0,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).getTime() : 0,
  };
}

export function mapLeaderboardMemberRow(row, index) {
  return {
    userId: row.id,
    name: row.name || "Member",
    photoURL: row.photoURL || "",
    role: row.role || "member",
    plan: row.plan || "flirting",
    points: row.points || 0,
    badgeCount:
      row.badges && typeof row.badges === "object"
        ? Object.keys(row.badges).length
        : 0,
    rank: index + 1,
  };
}