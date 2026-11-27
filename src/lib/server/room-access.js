import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getActiveRoomEnsuring } from "@/lib/server/rooms";
import { getScopedHostRights } from "@/lib/server/hosts";
import { isSpaceMember } from "@/lib/server/spaces";
import { getUpcomingRoomStart } from "@/lib/server/events";
import { toMillis } from "@/lib/server/user-core";
import { isCanonicalAlwaysOnRoom } from "@/lib/room-config";

// Single authorization choke point for every room-chat surface (messages,
// signals, presence, reactions, pins, deletes and the room page itself).
//
// Rules:
//  - A canonical always-on lounge is public: any active member is entitled.
//  - Staff (owner/moderator) and the room's host/co-host are always entitled.
//  - Any other room is gated by its membership: members of its Space, then of
//    its Group, may enter; outsiders are denied.
//
// Every denial collapses to the same "Room not found" so the existence of a
// private room cannot be probed. Returns { room } when allowed.
export async function resolveRoomAccess(roomKey, uid, userDoc) {
  const room = await getActiveRoomEnsuring(roomKey);
  if (!room || (room.status && room.status !== "active")) {
    return { denied: "not_found" };
  }
  if (isCanonicalAlwaysOnRoom(room)) return { room };

  const staff = userDoc?.role === "owner" || userDoc?.role === "moderator";
  const rights = await getScopedHostRights(uid, "room", room.id);
  const roomHost = rights.isHost || rights.isCoHost;
  if (staff || roomHost) return { room };

  // Scheduled lounges are visible in the listing, but the room surface itself
  // must not open before the event starts. The token route mirrors this check.
  const upcoming = await getUpcomingRoomStart(room.slug);
  const opensAtMillis = toMillis(upcoming || room.opensAt);
  if (opensAtMillis && opensAtMillis > Date.now()) {
    return { denied: "not_open" };
  }

  if (room.spaceId && !(await spaceMember(room.spaceId, uid))) {
    return { denied: "not_found" };
  }
  if (room.groupId && !(await groupMember(room.groupId, uid))) {
    return { denied: "not_found" };
  }
  return { room };
}

export async function requireRoomAccess(roomKey, uid, userDoc) {
  const result = await resolveRoomAccess(roomKey, uid, userDoc);
  if (result.denied) {
    return { denied: NextResponse.json({ error: "Room not found" }, { status: 404 }) };
  }
  return { room: result.room };
}

async function spaceMember(spaceId, uid) {
  try {
    return !!(await isSpaceMember(spaceId, uid));
  } catch {
    return false;
  }
}

async function groupMember(groupId, uid) {
  try {
    const prisma = getPrisma();
    if (!prisma) return false;
    const row = await prisma.groupMember.findUnique({
      where: { id: `${groupId}_${uid}` },
    });
    return !!row;
  } catch (err) {
    logError("room-access.prisma_group_member_failed", { error: err.message });
    return false;
  }
}