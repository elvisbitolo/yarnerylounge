import { NextResponse } from "next/server";
import { deleteWhere, deletePostWithComments } from "@/lib/server/delete";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { updateContent } from "@/lib/server/admin-content";
import { requireOwner, guardJson } from "@/lib/server/authorize";

export async function DELETE(req, { params }) {
  const { id } = await params;
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  try {
    const rooms = await prisma.room.findMany({
      where: { groupId: id },
      select: { id: true },
    });
    for (const room of rooms) {
      await prisma.roomEvent.deleteMany({ where: { roomId: room.id } });
      await prisma.roomSignal.deleteMany({ where: { roomId: room.id } });
      await prisma.roomMessage.deleteMany({ where: { roomId: room.id } });
      await prisma.room.delete({ where: { id: room.id } });
    }

    await prisma.post.deleteMany({ where: { groupId: id } });

    await prisma.groupMember.deleteMany({ where: { groupId: id } });
    await prisma.group.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("group.delete_failed", { error: err.message });
    return NextResponse.json({ error: "Could not delete group" }, { status: 500 });
  }
}

/** Editing group copy is owner-only, matching the existing delete guard below. */
export async function PATCH(req, { params }) {
  const { id } = await params;
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const result = await updateContent("group", id, body, { ...auth.user, ...auth.userDoc });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, changed: result.changed });
}
