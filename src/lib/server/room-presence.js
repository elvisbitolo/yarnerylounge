import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const ROOM_PRESENCE_WINDOW_MS = 90_000;

function cutoffDate(now = Date.now()) {
  return new Date(now - ROOM_PRESENCE_WINDOW_MS);
}

export async function getRoomPresence(roomId, now = Date.now()) {
  const prisma = getPrisma();
  if (!prisma || !roomId) return [];
  try {
    const rows = await prisma.roomPresence.findMany({
      where: { roomId, leftAt: null, lastSeenAt: { gt: cutoffDate(now) } },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, name: true, photoURL: true, country: true, location: true } } },
    });
    const seen = new Set();
    return rows.filter((row) => {
      if (seen.has(row.userId)) return false;
      seen.add(row.userId);
      return true;
    }).map((row) => ({
      userId: row.userId,
      name: row.user?.name || "Member",
      photoURL: row.user?.photoURL || "",
      country: row.user?.country || "",
      location: row.user?.location || "",
      joinedAt: row.joinedAt,
      lastSeenAt: row.lastSeenAt,
    }));
  } catch (err) {
    logError("room-presence.read_failed", { error: err.message, roomId });
    return [];
  }
}

// Who is in any room right now, and whether that answer can be trusted.
//
// This returns `ok: false` on a failed or unavailable query rather than an empty
// list, because "nobody is in the lounge" and "we could not ask" are different
// facts and the member directory renders them differently. Returning a bare []
// made the two identical, so a presence blip showed as an empty lounge.
export async function listActiveRoomMemberIds(now = Date.now()) {
  const prisma = getPrisma();
  if (!prisma) return { uids: [], ok: false };
  try {
    const rows = await prisma.roomPresence.findMany({
      where: { leftAt: null, lastSeenAt: { gt: cutoffDate(now) } },
      select: { userId: true },
      distinct: ["userId"],
    });
    return { uids: rows.map((row) => row.userId), ok: true };
  } catch (err) {
    logError("room-presence.active_members_failed", { error: err.message });
    return { uids: [], ok: false };
  }
}

export async function countActiveRoomMembers(roomIds = [], now = Date.now()) {
  const prisma = getPrisma();
  if (!prisma) return 0;
  try {
    const where = { leftAt: null, lastSeenAt: { gt: cutoffDate(now) } };
    if (roomIds.length) where.roomId = { in: roomIds };
    const rows = await prisma.roomPresence.findMany({ where, select: { userId: true }, distinct: ["userId"] });
    return rows.length;
  } catch (err) {
    logError("room-presence.count_failed", { error: err.message });
    return 0;
  }
}

// Per-room active member counts, keyed by roomId. Distinct per room so two
// tabs in the same lounge count once.
export async function activeRoomMemberCounts(roomIds = [], now = Date.now()) {
  const counts = new Map();
  if (roomIds.length === 0) return counts;
  const prisma = getPrisma();
  if (!prisma) return counts;
  try {
    const rows = await prisma.roomPresence.findMany({
      where: { leftAt: null, lastSeenAt: { gt: cutoffDate(now) }, roomId: { in: roomIds } },
      select: { roomId: true, userId: true },
      distinct: ["roomId", "userId"],
    });
    for (const row of rows) {
      counts.set(row.roomId, (counts.get(row.roomId) || 0) + 1);
    }
  } catch (err) {
    logError("room-presence.counts_failed", { error: err.message });
  }
  return counts;
}

export async function touchRoomPresence({ sessionId, roomId, userId }) {
  const prisma = getPrisma();
  if (!prisma) return { error: "Database unavailable" };
  try {
    const existing = await prisma.roomPresence.findUnique({ where: { id: sessionId }, select: { roomId: true, userId: true } });
    if (existing && (existing.roomId !== roomId || existing.userId !== userId)) return { error: "Invalid lounge session" };
    const row = await prisma.roomPresence.upsert({
      where: { id: sessionId },
      create: { id: sessionId, roomId, userId, joinedAt: new Date(), lastSeenAt: new Date(), leftAt: null },
      update: { lastSeenAt: new Date(), leftAt: null },
      select: { id: true, lastSeenAt: true },
    });
    return { presence: row };
  } catch (err) {
    logError("room-presence.touch_failed", { error: err.message, roomId, userId });
    return { error: "Could not update lounge presence" };
  }
}

export async function leaveRoomPresence({ sessionId, roomId, userId }) {
  const prisma = getPrisma();
  if (!prisma) return { error: "Database unavailable" };
  try {
    const row = await prisma.roomPresence.findUnique({ where: { id: sessionId }, select: { roomId: true, userId: true } });
    if (!row || row.roomId !== roomId || row.userId !== userId) return { ok: true };
    await prisma.roomPresence.update({ where: { id: sessionId }, data: { leftAt: new Date(), lastSeenAt: new Date() } });
    return { ok: true };
  } catch (err) {
    logError("room-presence.leave_failed", { error: err.message, roomId, userId });
    return { error: "Could not leave lounge presence" };
  }
}
