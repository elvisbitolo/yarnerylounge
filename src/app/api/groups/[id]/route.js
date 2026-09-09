import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { deleteWhere, deletePostWithComments } from "@/lib/server/delete";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function DELETE(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userDoc = await getUserDoc(user.uid);
  if (userDoc?.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
