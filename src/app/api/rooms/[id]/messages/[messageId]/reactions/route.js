import { NextResponse } from "next/server";
import { requireActiveMember } from "@/lib/server/authorize";
import { guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { requireRoomAccess } from "@/lib/server/room-access";
import {
  toggleRoomReaction,
  ROOM_QUICK_EMOJIS,
} from "@/lib/server/room-messages";

export async function POST(req, { params }) {
  const { id: roomId, messageId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`room-react:${auth.user.uid}`, { limit: 60 });
  if (limited) return limited;

  const access = await requireRoomAccess(roomId, auth.user.uid, auth.userDoc);
  if (access.denied) return access.denied;
  const room = access.room;

  const body = await req.json().catch(() => ({}));
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";
  if (!emoji || !ROOM_QUICK_EMOJIS.includes(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  const result = await toggleRoomReaction(room.id, messageId, auth.user.uid, emoji);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ reactions: result.reactions });
}
