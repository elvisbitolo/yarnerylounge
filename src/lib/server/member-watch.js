import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { createNotification } from "@/lib/server/notifications";
import { resolveRoomAccess } from "@/lib/server/room-access";
import { BLOCKED_KEY, isSafetyId } from "./member-safety-core.js";
import {
  WATCH_ONLINE_COOLDOWN_MS,
  WATCH_ROOM_COOLDOWN_MS,
  canWatch,
  onlineNotifyText,
  roomNotifyText,
  shouldNotifyOnline,
  shouldNotifyRoom,
} from "./member-watch-core.js";

const WATCH_SELECT = {
  id: true,
  watcherId: true,
  lastOnlineNotifiedAt: true,
  lastRoomId: true,
  lastRoomNotifiedAt: true,
};

const MEMBER_SELECT = { id: true, name: true, suspended: true, role: true, extra: true };

export async function getWatchState(watcherId, targetId) {
  if (!canWatch(watcherId, targetId)) return { watching: false };
  try {
    const prisma = getPrisma();
    if (!prisma) return { watching: false };
    const row = await prisma.memberWatch.findUnique({
      where: { watcherId_targetId: { watcherId, targetId } },
      select: { id: true },
    });
    return { watching: !!row };
  } catch (err) {
    logError("member-watch.state_failed", { error: err.message });
    return { watching: false };
  }
}

export async function setWatch(watcherId, targetId, enabled) {
  if (!canWatch(watcherId, targetId)) throw new Error("INVALID_MEMBER");
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_UNAVAILABLE");
  if (enabled) {
    await prisma.memberWatch.upsert({
      where: { watcherId_targetId: { watcherId, targetId } },
      create: { watcherId, targetId },
      update: {},
    });
  } else {
    await prisma.memberWatch.deleteMany({ where: { watcherId, targetId } });
  }
  return { watching: !!enabled };
}

// Blocking someone drops the watch I hold on them. The reverse direction is
// left alone on purpose: the fan-out checks both sides anyway, and a member
// who unblocks later gets their old watch back instead of losing it silently.
export async function dropWatch(watcherId, targetId) {
  if (!canWatch(watcherId, targetId)) return;
  try {
    const prisma = getPrisma();
    if (!prisma) return;
    await prisma.memberWatch.deleteMany({ where: { watcherId, targetId } });
  } catch (err) {
    logError("member-watch.drop_failed", { error: err.message });
  }
}

// Loads the watched pair plus every watcher in one pass and hands them to a
// per-watcher filter. Returns null when the event must not be announced at all.
async function loadFanout(targetId) {
  const prisma = getPrisma();
  if (!prisma || !targetId) return null;
  const watches = await prisma.memberWatch.findMany({
    where: { targetId },
    select: WATCH_SELECT,
  });
  if (watches.length === 0) return null;
  const rows = await prisma.user.findMany({
    where: { id: { in: [targetId, ...watches.map((w) => w.watcherId)] } },
    select: MEMBER_SELECT,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const target = byId.get(targetId);
  if (!target || target.suspended) return null;
  const targetExtra = target.extra;
  // Members who hide their presence are hidden everywhere — the online strip,
  // live presence reads, and therefore their watch alerts too.
  if (targetExtra?.chatSettings?.onlineVisibility === "nobody") return null;
  return { prisma, watches, byId, target, targetExtra };
}

function pairBlocked(watcher, watcherId, targetExtra, targetId) {
  return isSafetyId(watcher.extra, BLOCKED_KEY, targetId) || isSafetyId(targetExtra, BLOCKED_KEY, watcherId);
}

// Claim the cooldown slot *before* writing the notification: concurrent
// heartbeats racing the same pair must not both pass the read-then-write window.
async function claimOnline(prisma, watchId, now) {
  const cutoff = new Date(now - WATCH_ONLINE_COOLDOWN_MS);
  const res = await prisma.memberWatch.updateMany({
    where: {
      id: watchId,
      OR: [{ lastOnlineNotifiedAt: null }, { lastOnlineNotifiedAt: { lt: cutoff } }],
    },
    data: { lastOnlineNotifiedAt: new Date(now) },
  });
  return res.count === 1;
}

async function claimRoom(prisma, watchId, roomId, now) {
  const cutoff = new Date(now - WATCH_ROOM_COOLDOWN_MS);
  const res = await prisma.memberWatch.updateMany({
    where: {
      id: watchId,
      // Claim unless this exact lounge was already announced inside the window.
      NOT: { AND: [{ lastRoomId: roomId }, { lastRoomNotifiedAt: { gte: cutoff } }] },
    },
    data: { lastRoomId: roomId, lastRoomNotifiedAt: new Date(now) },
  });
  return res.count === 1;
}

/**
 * Tell everyone watching `targetId` that they came online (offline → online
 * transition). Never throws: it runs from `after()` in the presence heartbeat,
 * and a failed watch alert must not fail the heartbeat.
 */
export async function notifyWatchersOnline(targetId, now = Date.now()) {
  try {
    const ctx = await loadFanout(targetId);
    if (!ctx) return { notified: 0 };
    const { prisma, watches, byId, target, targetExtra } = ctx;
    let notified = 0;
    for (const watch of watches) {
      const watcher = byId.get(watch.watcherId);
      if (!watcher || watcher.suspended) continue;
      if (pairBlocked(watcher, watch.watcherId, targetExtra, targetId)) continue;
      if (!shouldNotifyOnline({ lastOnlineNotifiedAt: watch.lastOnlineNotifiedAt, now })) continue;
      if (!(await claimOnline(prisma, watch.id, now))) continue;
      const ok = await createNotification({
        userId: watcher.id,
        type: "watch_online",
        actorId: targetId,
        actorName: target.name,
        targetId,
        href: `/members/${targetId}`,
        text: onlineNotifyText(),
      });
      if (ok) notified += 1;
    }
    return { notified };
  } catch (err) {
    logError("member-watch.online_notify_failed", { targetId, error: err.message });
    return { notified: 0 };
  }
}

/**
 * Tell everyone watching `targetId` that they walked into `room` — but only
 * watchers who are themselves allowed in that lounge: a private space or group
 * room must not leak to someone outside it through a notification. When in
 * doubt nothing is sent; a quieter notification beats a private-room leak.
 */
export async function notifyWatchersRoom(targetId, room, now = Date.now()) {
  try {
    if (!room || !room.id) return { notified: 0 };
    const ctx = await loadFanout(targetId);
    if (!ctx) return { notified: 0 };
    const { prisma, watches, byId, target, targetExtra } = ctx;
    let notified = 0;
    for (const watch of watches) {
      const watcher = byId.get(watch.watcherId);
      if (!watcher || watcher.suspended) continue;
      if (pairBlocked(watcher, watch.watcherId, targetExtra, targetId)) continue;
      if (
        !shouldNotifyRoom({
          lastRoomId: watch.lastRoomId,
          lastRoomNotifiedAt: watch.lastRoomNotifiedAt,
          roomId: room.id,
          now,
        })
      ) {
        continue;
      }
      const access = await resolveRoomAccess(room.id, watcher.id, watcher);
      if (access.denied) continue;
      if (!(await claimRoom(prisma, watch.id, room.id, now))) continue;
      const ok = await createNotification({
        userId: watcher.id,
        type: "watch_room",
        actorId: targetId,
        actorName: target.name,
        targetId,
        href: room.slug ? `/rooms/${room.slug}` : "/rooms",
        text: roomNotifyText(room.name),
      });
      if (ok) notified += 1;
    }
    return { notified };
  } catch (err) {
    logError("member-watch.room_notify_failed", { targetId, error: err.message });
    return { notified: 0 };
  }
}
