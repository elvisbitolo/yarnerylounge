import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { listRooms } from "@/lib/server/rooms";
import { isRoomLive } from "@/lib/server/rooms-core";
import { countActiveRoomMembers } from "@/lib/server/room-presence";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const rooms = await listRooms();

  const live = rooms
    .filter((room) => room.status === "active" && isRoomLive(room))
    .sort((a, b) => {
      const aBroadcast = (a.kind || "standard") === "broadcast" ? 0 : 1;
      const bBroadcast = (b.kind || "standard") === "broadcast" ? 0 : 1;
      if (aBroadcast !== bBroadcast) return aBroadcast - bBroadcast;
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
    })
    .slice(0, 5)
    .map((room) => ({
      id: room.id,
      slug: room.slug,
      name: room.name,
      kind: room.kind || "standard",
    }));
  const viewerCount = await countActiveRoomMembers(live.map((room) => room.id));
  return NextResponse.json({ rooms: live, viewerCount });
}
