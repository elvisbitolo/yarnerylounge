import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getScopedHostRights } from "@/lib/server/hosts";
import { logAudit } from "@/lib/server/audit";
import { clean } from "@/lib/server/validate";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

function isStaff(auth) {
  return auth.userDoc?.role === "owner" || auth.userDoc?.role === "moderator";
}

async function canManageRoom(auth, room) {
  if (isStaff(auth)) return { ok: true, isHost: true };
  const rights = await getScopedHostRights(auth.user.uid, "room", room.id);
  if (room.spaceId) {
    const spaceRights = await getScopedHostRights(auth.user.uid, "space", room.spaceId);
    if (spaceRights.isHost || spaceRights.isCoHost) {
      return { ok: true, isHost: spaceRights.isHost };
    }
  }
  if (room.groupId) {
    const groupRights = await getScopedHostRights(auth.user.uid, "group", room.groupId);
    if (groupRights.isHost || groupRights.isCoHost) {
      return { ok: true, isHost: groupRights.isHost };
    }
  }
  return { ok: rights.isHost || rights.isCoHost, isHost: rights.isHost };
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  let room = null;
  try {
    const prisma = getPrisma();
    const row = await prisma.room.findUnique({
      where: { id },
      select: { id: true, spaceId: true, groupId: true },
    });
    if (!row) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    room = { id, spaceId: row.spaceId, groupId: row.groupId };
  } catch (err) {
    logError("room.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load room" }, { status: 500 });
  }

  const access = await canManageRoom(auth, room);
  if (!access.ok) {
    return NextResponse.json({ error: "Host access required" }, { status: 403 });
  }

  const body = await req.json();
  const update = {};
  const changed = [];

  if (typeof body.publicPreview === "boolean") {
    update.publicPreview = body.publicPreview;
    changed.push("publicPreview");
  }
  if (typeof body.recordingAllowed === "boolean") {
    update.recordingAllowed = body.recordingAllowed;
    changed.push("recordingAllowed");
  }
  if (body.replayVisibility === "owner" || body.replayVisibility === "members") {
    update.replayVisibility = body.replayVisibility;
    changed.push("replayVisibility");
  }
  if (typeof body.name === "string") {
    const n = clean(body.name, 80);
    if (n) {
      update.name = n;
      changed.push("name");
    }
  }
  if (typeof body.description === "string") {
    update.description = clean(body.description, 5000);
    changed.push("description");
  }
  if (body.opensAt !== undefined) {
    if (body.opensAt === null || body.opensAt === "") {
      update.opensAt = null;
    } else {
      const parsed = new Date(body.opensAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid schedule" }, { status: 400 });
      }
      update.opensAt = parsed;
    }
    changed.push("opensAt");
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    await prisma.room.update({
      where: { id },
      data: {
        ...(update.publicPreview !== undefined && { publicPreview: update.publicPreview }),
        ...(update.recordingAllowed !== undefined && { recordingAllowed: update.recordingAllowed }),
        ...(update.replayVisibility !== undefined && { replayVisibility: update.replayVisibility }),
        ...(update.name !== undefined && { name: update.name }),
        ...(update.description !== undefined && { description: update.description }),
        opensAt: update.opensAt === undefined ? undefined : update.opensAt,
      },
    });
  } catch (err) {
    logError("room.update_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "room.updated",
    targetId: id,
    metadata: { fields: changed },
  });
  return NextResponse.json({ ok: true, fields: changed });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  let room = null;
  try {
    const prisma = getPrisma();
    const row = await prisma.room.findUnique({
      where: { id },
      select: { id: true, spaceId: true, groupId: true, slug: true, name: true },
    });
    if (!row) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    room = { id, spaceId: row.spaceId, groupId: row.groupId, slug: row.slug, name: row.name };
  } catch (err) {
    logError("room.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load room" }, { status: 500 });
  }

  const access = await canManageRoom(auth, room);
  if (!access.ok || !access.isHost) {
    return NextResponse.json({ error: "Room host access required" }, { status: 403 });
  }

  try {
    const prisma = getPrisma();
    await prisma.roomEvent.deleteMany({ where: { roomId: id } });
    await prisma.roomSignal.deleteMany({ where: { roomId: id } });
    await prisma.roomMessage.deleteMany({ where: { roomId: id } });
    await prisma.room.delete({ where: { id } });
  } catch (err) {
    logError("room.delete_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to delete room" }, { status: 500 });
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "room.deleted",
    targetId: id,
    metadata: { name: room.name || "" },
  });

  return NextResponse.json({ ok: true });
}