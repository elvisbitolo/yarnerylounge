import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { ROOM_PRESENCE_WINDOW_MS, countActiveRoomMembers } from "@/lib/server/room-presence";
import { LIVE_ANNOUNCER_EMAIL, pickAnnouncerRoom } from "./lounge-live-core.js";

export async function getAnnouncerLiveRoom(now = Date.now()) {
  const prisma = getPrisma();
  if (!prisma) return null;

  let owner = null;
  try {
    owner = await prisma.user.findFirst({
      where: { email: LIVE_ANNOUNCER_EMAIL },
      select: { id: true, email: true, name: true, photoURL: true },
    });
  } catch (err) {
    logError("lounge-live.banner_owner_lookup_failed", { error: err.message });
    return null;
  }
  if (!owner) return null;

  try {
    const rows = await prisma.roomPresence.findMany({
      where: { userId: owner.id, leftAt: null, lastSeenAt: { gt: new Date(now - ROOM_PRESENCE_WINDOW_MS) } },
      select: { room: { select: { id: true, slug: true, name: true, status: true } } },
    });
    const room = pickAnnouncerRoom(rows.map((row) => ({ ...row, user: owner })));
    if (!room) return null;
    const viewerCount = await countActiveRoomMembers([room.id], now);
    return { id: room.id, slug: room.slug, name: room.name, viewerCount };
  } catch (err) {
    logError("lounge-live.banner_failed", { error: err.message });
    return null;
  }
}
