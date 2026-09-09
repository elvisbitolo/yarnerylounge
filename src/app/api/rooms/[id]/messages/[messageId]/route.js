import { NextResponse } from "next/server";
import { requireActiveMember } from "@/lib/server/authorize";
import { guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getUserDoc } from "@/lib/server/auth";
import { getScopedHostRights } from "@/lib/server/hosts";
import {
  getRoomForChat,
  softDeleteRoomMessage,
} from "@/lib/server/room-messages";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function POST(req, { params }) {
  const { id: roomId, messageId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`room-del:${auth.user.uid}`, { limit: 40 });
  if (limited) return limited;

  const room = await getRoomForChat(roomId);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const userDoc = await getUserDoc(auth.user.uid);
  const staff = userDoc?.role === "owner" || userDoc?.role === "moderator";
  const rights = await getScopedHostRights(auth.user.uid, "room", roomId);

  let message = null;
  try {
    const prisma = getPrisma();
    const row = await prisma.roomMessage.findUnique({
      where: { id: messageId, roomId },
      select: { userId: true },
    });
    if (!row) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    message = row;
  } catch (err) {
    logError("room-message.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const canModerate = staff || rights.isHost || rights.isCoHost;
  if (!canModerate && message.userId !== auth.user.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await softDeleteRoomMessage(roomId, messageId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}