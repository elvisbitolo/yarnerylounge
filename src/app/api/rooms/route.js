import { NextResponse } from "next/server";
import { listRooms } from "@/lib/server/rooms";
import { requireUser, requireOwner, guardJson } from "@/lib/server/authorize";
import { getScopedHostRights } from "@/lib/server/hosts";
import { logAudit } from "@/lib/server/audit";
import { getSpace, getSpaceMembers } from "@/lib/server/spaces";
import { createNotification } from "@/lib/server/notifications";
import { getUserDoc } from "@/lib/server/auth";
import { serialize } from "@/lib/server/serialize";
import { slugify } from "@/lib/server/rooms";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;
  const rooms = await listRooms();
  return NextResponse.json({ rooms: serialize(rooms) });
}

function isStaff(auth) {
  return auth.userDoc?.role === "owner" || auth.userDoc?.role === "moderator";
}

async function canCreateInScope(uid, groupId, spaceId) {
  if (groupId) {
    const rights = await getScopedHostRights(uid, "group", groupId);
    return rights.isHost;
  }
  if (spaceId) {
    const rights = await getScopedHostRights(uid, "space", spaceId);
    return rights.isHost;
  }
  return false;
}

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { name, description = "", maxParticipants = 20, groupId = "", spaceId = "", kind = "standard", publicPreview = false, opensAt = null, recordingAllowed = true, replayVisibility = "members" } = await req.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Room name required" }, { status: 400 });
  }
  if (groupId && spaceId) {
    return NextResponse.json({ error: "A room belongs to a group OR a space, not both" }, { status: 400 });
  }
  const staff = isStaff(auth);
  if (!staff && !(await canCreateInScope(auth.user.uid, groupId, spaceId))) {
    return NextResponse.json(
      { error: "Only staff or the host of the room's group or space can create rooms" },
      { status: 403 }
    );
  }
  const prisma = getPrisma();
  if (groupId) {
    try {
      const row = await prisma.group.findUnique({
        where: { id: groupId },
        select: { status: true },
      });
      if (!row || row.status !== "active") {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
    } catch (err) {
      logError("room.prisma_group_read_failed", { error: err.message });
      return NextResponse.json({ error: "Failed to validate group" }, { status: 500 });
    }
  }
  if (spaceId) {
    const space = await getSpace(spaceId);
    if (!space || space.status !== "active") {
      return NextResponse.json({ error: "Space not found" }, { status: 404 });
    }
  }

  const parsedOpensAt = opensAt ? new Date(opensAt) : null;
  if (parsedOpensAt && Number.isNaN(parsedOpensAt.getTime())) {
    return NextResponse.json({ error: "Invalid schedule" }, { status: 400 });
  }

  let room = null;
  try {
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
    const created = await prisma.room.create({
      data: {
        name,
        slug,
        description: description || "",
        status: "active",
        maxParticipants: Number(maxParticipants) || 20,
        groupId: groupId || "",
        spaceId: spaceId || "",
        kind: kind === "broadcast" ? "broadcast" : "standard",
        publicPreview: !!publicPreview,
        opensAt: parsedOpensAt || null,
        createdBy: auth.user.uid,
      },
    });
    room = { id: created.id, slug, name, description, kind };
  } catch (err) {
    logError("room.create_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "room.created",
    targetId: room.id,
    metadata: { name, slug: room.slug, groupId, spaceId, kind, opened: !!parsedOpensAt },
  });

  if (room.kind === "broadcast" && !parsedOpensAt) {
    await notifyRoomGoLive({
      room,
      actorId: auth.user.uid,
      actorName: auth.userDoc?.name || auth.user.email || "A host",
    });
  }

  return NextResponse.json({ room });
}

async function notifyRoomGoLive({ room, actorId, actorName }) {
  let members = [];
  try {
    const prisma = getPrisma();
    if (room.spaceId) {
      const spaceMembers = await getSpaceMembers(room.spaceId);
      members = spaceMembers
        .map((m) => m.userId)
        .filter((uid) => uid && uid !== actorId);
    } else if (room.groupId) {
      const rows = await prisma.groupMember.findMany({
        where: { groupId: room.groupId },
        select: { userId: true },
      });
      members = rows
        .map((d) => d.userId)
        .filter((uid) => uid && uid !== actorId);
    } else {
      const rows = await prisma.user.findMany({
        select: { id: true },
        take: 1000,
      });
      members = rows
        .map((d) => d.id)
        .filter((uid) => uid && uid !== actorId);
    }
  } catch (err) {
    logError("room.golive_members_failed", { error: err.message });
    return;
  }

  for (const uid of members) {
    const target = await getUserDoc(uid);
    const name = target?.name || "Member";
    await createNotification({
      userId: uid,
      type: "space_activity",
      actorId,
      actorName,
      targetId: room.id,
      href: `/rooms/${room.slug}`,
      text: `${actorName} just went live in "${room.name}". Join now.`,
    });
  }
}