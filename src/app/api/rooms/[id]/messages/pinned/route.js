import { NextResponse } from "next/server";
import { requireActiveMember } from "@/lib/server/authorize";
import { guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getUserDoc } from "@/lib/server/auth";
import { getScopedHostRights } from "@/lib/server/hosts";
import {
  getRoomForChat,
  listPinnedRoomMessages,
  toggleRoomPin,
} from "@/lib/server/room-messages";

export async function GET(req, { params }) {
  const { id: roomId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const room = await getRoomForChat(roomId);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const messages = await listPinnedRoomMessages(room.id);
  return NextResponse.json({ messages });
}

export async function POST(req, { params }) {
  const { id: roomId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`room-pin:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;

  const room = await getRoomForChat(roomId);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const userDoc = await getUserDoc(auth.user.uid);
  const staff = userDoc?.role === "owner" || userDoc?.role === "moderator";
  const rights = await getScopedHostRights(auth.user.uid, "room", room.id);
  if (!(staff || rights.isHost || rights.isCoHost)) {
    return NextResponse.json({ error: "Host controls required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";
  if (!messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }

  const result = await toggleRoomPin(room.id, messageId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ pinned: result.pinned });
}
