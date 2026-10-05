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

// Which lounge each of these users is currently in, keyed by userId. When a
// member has more than one active session, the most recently active lounge
// wins. Powers the "In <Lounge>" presence line and join affordance in chat.
export async function activeRoomsForUsers(userIds = [], now = Date.now()) {
  const map = {};
  if (userIds.length === 0) return map;
  const prisma = getPrisma();
  if (!prisma) return map;
  try {
    const rows = await prisma.roomPresence.findMany({
      where: { leftAt: null, lastSeenAt: { gt: cutoffDate(now) }, userId: { in: userIds } },
      select: { userId: true, roomId: true },
    });
    const roomIds = [...new Set(rows.map((row) => row.roomId))];
    const rooms = roomIds.length
      ? await prisma.room.findMany({
          where: { id: { in: roomIds } },
          select: { id: true, slug: true, name: true },
        })
      : [];
    const byId = new Map(rooms.map((room) => [room.id, room]));
    for (const row of rows) {
      if (map[row.userId]) continue;
      const room = byId.get(row.roomId);
      if (room) map[row.userId] = { slug: room.slug, name: room.name };
    }
  } catch (err) {
    logError("room-presence.user_rooms_failed", { error: err.message });
  }
  return map;
}

// The live headcount used to enforce Room.maxParticipants. Counts distinct
// people, not presence rows: one member heartbeating from two tabs must not
// consume two seats, and members who already left (leftAt set, or stale past
// the presence window) must not hold anyone out.
export async function countActiveRoomParticipants(roomId, now = Date.now()) {
  const prisma = getPrisma();
  if (!prisma || !roomId) return { count: 0, ok: false };
  try {
    const rows = await prisma.roomPresence.findMany({
      where: { roomId, leftAt: null, lastSeenAt: { gt: cutoffDate(now) } },
      select: { userId: true },
      distinct: ["userId"],
    });
    return { count: rows.length, ok: true };
  } catch (err) {
    logError("room-presence.count_failed", { error: err.message, roomId });
    return { count: 0, ok: false };
  }
}

// Does this specific member already hold a live place in the room? Used by the
// capacity check so a member who is already inside is never refused a join for
// their own room having filled up behind them.
export async function hasActiveRoomPresence(roomId, userId, now = Date.now()) {
  const prisma = getPrisma();
  if (!prisma || !roomId || !userId) return false;
  try {
    const row = await prisma.roomPresence.findFirst({
      where: { roomId, userId, leftAt: null, lastSeenAt: { gt: cutoffDate(now) } },
      select: { id: true },
    });
    return !!row;
  } catch (err) {
    logError("room-presence.has_active_failed", { error: err.message, roomId });
    return false;
  }
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
