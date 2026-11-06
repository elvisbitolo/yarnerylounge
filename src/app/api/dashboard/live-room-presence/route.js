import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { listVisibleCommunityRooms } from "@/lib/server/rooms";
import { isRoomLive } from "@/lib/server/rooms-core";
import { getRoomPresence } from "@/lib/server/room-presence";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`dashboard-room-presence:${auth.user.uid}`, { limit: 6, windowMs: 60_000 });
  if (limited) return limited;

  const rooms = await listVisibleCommunityRooms(auth.user.uid, auth.userDoc);
  const liveRooms = rooms.filter((room) => room.status === "active" && isRoomLive(room));
  const presence = await Promise.all(
    liveRooms.map(async (room) => ({
      slug: room.slug,
      members: await getRoomPresence(room.id),
    }))
  );

  return NextResponse.json({
    rooms: Object.fromEntries(presence.map((room) => [room.slug, room.members])),
    updatedAt: new Date().toISOString(),
  });
}
