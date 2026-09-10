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

export async function listActiveRoomMemberIds(now = Date.now()) {
  const prisma = getPrisma();
  if (!prisma) return [];
  try {
    const rows = await prisma.roomPresence.findMany({
      where: { leftAt: null, lastSeenAt: { gt: cutoffDate(now) } },
      select: { userId: true },
      distinct: ["userId"],
    });
    return rows.map((row) => row.userId);
  } catch (err) {
    logError("room-presence.active_members_failed", { error: err.message });
    return [];
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

export async function touchRoomPresence({ sessionId, roomId, userId }) {
  const prisma = getPrisma();
  if (!prisma) return { error: "Database unavailable" };
  try {
    const existing = await prisma.roomPresence.findUnique({ where: { id: sessionId }, select: { roomId: true, userId: true } });
    if (existing && (existing.roomId !== roomId || existing.userId !== userId)) return { error: "Invalid room session" };
    const row = await prisma.roomPresence.upsert({
      where: { id: sessionId },
      create: { id: sessionId, roomId, userId, joinedAt: new Date(), lastSeenAt: new Date(), leftAt: null },
      update: { lastSeenAt: new Date(), leftAt: null },
      select: { id: true, lastSeenAt: true },
    });
    return { presence: row };
  } catch (err) {
    logError("room-presence.touch_failed", { error: err.message, roomId, userId });
    return { error: "Could not update room presence" };
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
    return { error: "Could not leave room presence" };
  }
}
