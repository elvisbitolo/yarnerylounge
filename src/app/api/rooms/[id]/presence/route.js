import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { requireRoomAccess } from "@/lib/server/room-access";
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
  const access = await requireRoomAccess(roomId, auth.user.uid, auth.userDoc);
  if (access.denied) return access.denied;
  const presence = await getRoomPresence(access.room.id);
  return NextResponse.json({ roomId: access.room.id, count: presence.length, members: presence });
}

export async function POST(req, { params }) {
  const { id: roomId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const limited = rateLimitGuard(`room-presence:${auth.user.uid}`, { limit: 12, windowMs: 60_000 });
  if (limited) return limited;
  const access = await requireRoomAccess(roomId, auth.user.uid, auth.userDoc);
  if (access.denied) return access.denied;
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId || "");
  const status = body?.status;
  if (!validSessionId(sessionId) || !["join", "heartbeat", "leave"].includes(status)) {
    return NextResponse.json({ error: "Invalid room presence" }, { status: 400 });
  }
  const input = { sessionId, roomId: access.room.id, userId: auth.user.uid };
  const result = status === "leave" ? await leaveRoomPresence(input) : await touchRoomPresence(input);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
