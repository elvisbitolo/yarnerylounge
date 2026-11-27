import { NextResponse } from "next/server";
import { listVisibleCommunityRooms, createRoom } from "@/lib/server/rooms";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getScopedHostRights, setHostAssignment } from "@/lib/server/hosts";
import { getCapabilities, canHost } from "@/lib/server/capabilities";
import { logAudit } from "@/lib/server/audit";
import { getSpace } from "@/lib/server/spaces";
import { serialize } from "@/lib/server/serialize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;
  const rooms = await listVisibleCommunityRooms(auth.user.uid, auth.userDoc);
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

  const body = await req.json();
  const {
    name,
    description = "",
    maxParticipants = 20,
    groupId = "",
    spaceId = "",
    kind = "standard",
    publicPreview = false,
    opensAt = null,
    vibe = "",
    vibeMode = "",
    color = "",
    rule = "",
    imageUrl = "",
    musicUrl = "",
    musicFileId = "",
    musicName = "",
    musicPlaying = false,
    recordingAllowed = true,
    replayVisibility = "members",
  } = body || {};
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Lounge name required" }, { status: 400 });
  }
  if (name.length > 120) {
    return NextResponse.json({ error: "Lounge name must be 120 characters or fewer" }, { status: 400 });
  }
  if (typeof description === "string" && description.length > 5000) {
    return NextResponse.json({ error: "Description must be 5000 characters or fewer" }, { status: 400 });
  }
  if (groupId && spaceId) {
    return NextResponse.json({ error: "A lounge belongs to a group OR a space, not both" }, { status: 400 });
  }
  // Moving In sells "host privileges to create, name, and schedule your own public
  // or private live video rooms". Previously only staff or an existing scoped host
  // assignment could create one, so the tier paid for nothing here. Additive: staff
  // and scoped hosts keep working exactly as before.
  const staff = isStaff(auth);
  const tierCanHost = canHost(await getCapabilities(auth.user.uid));
  if (!staff && !tierCanHost && !(await canCreateInScope(auth.user.uid, groupId, spaceId))) {
    return NextResponse.json(
      { error: "Creating a lounge requires a Moving In membership, or being staff or the host of its group or space" },
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

  const room = await createRoom({
    name,
    description,
    maxParticipants,
    groupId,
    spaceId,
    kind,
    publicPreview,
    createdBy: auth.user.uid,
    opensAt: parsedOpensAt,
    vibe,
    vibeMode,
    color,
    rule,
    imageUrl,
    musicUrl,
    musicFileId,
    musicName,
    musicPlaying,
    recordingAllowed,
    replayVisibility,
  });
  if (!room.id) {
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }

  // A paid member may create a lounge without a group/space scope. They must
  // still own the room they created, or every management surface treats the
  // creator as a stranger.
  const assignment = await setHostAssignment({
    scopeType: "room",
    scopeId: room.id,
    userId: auth.user.uid,
    role: "host",
    grantedBy: auth.user.uid,
  });
  if (!assignment.ok) {
    logError("room.creator_host_assignment_failed", { error: assignment.error, roomId: room.id });
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "room.created",
    targetId: room.id,
    metadata: {
      name,
      slug: room.slug,
      groupId,
      spaceId,
      kind: room.kind,
      alwaysOn: false,
      vibeMode,
      opened: !!parsedOpensAt,
    },
  });

  return NextResponse.json({ room });
}