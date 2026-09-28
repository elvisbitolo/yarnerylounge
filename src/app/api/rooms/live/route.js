import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { listRooms } from "@/lib/server/rooms";
import { isRoomLive, pickBannerRooms } from "@/lib/server/rooms-core";
import { countActiveRoomMembers } from "@/lib/server/room-presence";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const rooms = await listRooms();

  const live = pickBannerRooms(
    rooms.filter((room) => room.status === "active" && isRoomLive(room))
  ).map((room) => ({
    id: room.id,
    slug: room.slug,
    name: room.name,
    kind: room.kind || "standard",
  }));
  const viewerCount = await countActiveRoomMembers(live.map((room) => room.id));
  return NextResponse.json({ rooms: live, viewerCount });
}
