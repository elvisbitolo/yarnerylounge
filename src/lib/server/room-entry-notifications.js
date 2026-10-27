import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { createNotification } from "@/lib/server/notifications";
import { resolveRoomAccess } from "@/lib/server/room-access";
import { BLOCKED_KEY, isSafetyId } from "@/lib/server/member-safety-core";
import { NOT_SUSPENDED } from "@/lib/server/member-visibility-core";

const ROOM_WATCH_COOLDOWN_MS = 2 * 60 * 1000;
const MEMBER_SELECT = { id: true, name: true, suspended: true, extra: true };

function isBlockedBetween(watcher, target) {
  return (
    isSafetyId(watcher.extra, BLOCKED_KEY, target.id) ||
    isSafetyId(target.extra, BLOCKED_KEY, watcher.id)
  );
}

async function claimWatchedRoomNotice(prisma, watch, roomId, now) {
  const cutoff = new Date(now - ROOM_WATCH_COOLDOWN_MS);
  const result = await prisma.memberWatch.updateMany({
    where: {
      id: watch.id,
      NOT: { AND: [{ lastRoomId: roomId }, { lastRoomNotifiedAt: { gte: cutoff } }] },
    },
    data: { lastRoomId: roomId, lastRoomNotifiedAt: new Date(now) },
  });
  return result.count === 1;
}

/**
 * Notify members when someone genuinely joins a room (the caller has already
 * filtered duplicate joins and runs this after the HTTP response).
 *
 * Default recipients use the independent "roomActivity" preference. Members
 * who explicitly watch this person use their existing "watch" preference and
 * cooldown instead, preventing duplicate notifications while preserving the
 * profile Notify feature when general room-entry alerts are disabled.
 */
export async function notifyRoomEntryMembers(targetId, room, now = Date.now()) {
  const prisma = getPrisma();
  if (!prisma || !targetId || !room?.id) return { notified: 0 };

  try {
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: MEMBER_SELECT,
    });
    if (!target || target.suspended) return { notified: 0 };
    // Honour the member's existing presence privacy setting.
    if (target.extra?.chatSettings?.onlineVisibility === "nobody") return { notified: 0 };

    const [recipients, watches] = await Promise.all([
      prisma.user.findMany({
        where: { ...NOT_SUSPENDED, id: { not: targetId } },
        select: MEMBER_SELECT,
      }),
      prisma.memberWatch.findMany({
        where: { targetId },
        select: {
          id: true,
          watcherId: true,
          lastRoomId: true,
          lastRoomNotifiedAt: true,
        },
      }),
    ]);
    const watchesByWatcher = new Map(watches.map((watch) => [watch.watcherId, watch]));
    let notified = 0;

    for (const recipient of recipients) {
      if (isBlockedBetween(recipient, target)) continue;

      // Never reveal a private group/space room to a member without access.
      const access = await resolveRoomAccess(room.id, recipient.id, recipient);
      if (access.denied) continue;

      const watch = watchesByWatcher.get(recipient.id);
      if (watch) {
        if (!(await claimWatchedRoomNotice(prisma, watch, room.id, now))) continue;
        const ok = await createNotification({
          userId: recipient.id,
          type: "watch_room",
          actorId: target.id,
          actorName: target.name || "Member",
          targetId: target.id,
          href: room.slug ? `/rooms/${room.slug}` : "/rooms",
          text: `entered ${room.name || "a chat room"}.`,
        });
        if (ok) notified += 1;
        continue;
      }

      const ok = await createNotification({
        userId: recipient.id,
        type: "room_entry",
        actorId: target.id,
        actorName: target.name || "Member",
        targetId: target.id,
        href: room.slug ? `/rooms/${room.slug}` : "/rooms",
        text: `entered ${room.name || "a chat room"}.`,
      });
      if (ok) notified += 1;
    }

    return { notified };
  } catch (err) {
    logError("room-entry.notify_failed", { targetId, roomId: room.id, error: err?.message });
    return { notified: 0 };
  }
}
