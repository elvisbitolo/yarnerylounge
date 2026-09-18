import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getActiveRoomEnsuring } from "@/lib/server/rooms";
import { getScopedHostRights } from "@/lib/server/hosts";
import { isSpaceMember } from "@/lib/server/spaces";

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
  if (room.alwaysOn) return { room };

  const staff = userDoc?.role === "owner" || userDoc?.role === "moderator";
  if (staff) return { room };

  const rights = await getScopedHostRights(uid, "room", room.id);
  if (rights.isHost || rights.isCoHost) return { room };

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