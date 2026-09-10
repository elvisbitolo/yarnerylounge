import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getRoomForChat } from "@/lib/server/room-messages";
import { getRoomPresence, leaveRoomPresence, touchRoomPresence } from "@/lib/server/room-presence";

export const dynamic = "force-dynamic";

function validSessionId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{16,100}$/.test(value);
}

export async function GET(req, { params }) {
  const { id: roomId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const room = await getRoomForChat(roomId);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  const presence = await getRoomPresence(room.id);
  return NextResponse.json({ roomId: room.id, count: presence.length, members: presence });
}

export async function POST(req, { params }) {
  const { id: roomId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const limited = rateLimitGuard(`room-presence:${auth.user.uid}`, { limit: 12, windowMs: 60_000 });
  if (limited) return limited;
  const room = await getRoomForChat(roomId);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId || "");
  const status = body?.status;
  if (!validSessionId(sessionId) || !["join", "heartbeat", "leave"].includes(status)) {
    return NextResponse.json({ error: "Invalid room presence" }, { status: 400 });
  }
  const input = { sessionId, roomId: room.id, userId: auth.user.uid };
  const result = status === "leave" ? await leaveRoomPresence(input) : await touchRoomPresence(input);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
