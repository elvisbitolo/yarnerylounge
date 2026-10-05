import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { requireRoomAccess } from "@/lib/server/room-access";
import {
  getRoomPresence,
  leaveRoomPresence,
  touchRoomPresence,
  countActiveRoomParticipants,
  hasActiveRoomPresence,
} from "@/lib/server/room-presence";
import { evaluateJoinCapacity } from "@/lib/server/room-capacity-core";
import { getScopedHostRights } from "@/lib/server/hosts";

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
  const room = access.room;

  // Enforce Room.maxParticipants, which was previously stored and displayed but
  // never checked, so every lounge accepted unlimited concurrent members.
  // Only on a genuine new join: a heartbeat for a seat already held must never
  // be refused, or a room filling up would freeze the people inside it.
  if (status !== "leave") {
    const [headcount, rights, alreadyPresent] = await Promise.all([
      countActiveRoomParticipants(room.id),
      getScopedHostRights(auth.user.uid, "room", room.id),
      hasActiveRoomPresence(room.id, auth.user.uid),
    ]);
    if (headcount.ok) {
      const exempt =
        auth.userDoc?.role === "owner" ||
        auth.userDoc?.role === "moderator" ||
        rights.isHost ||
        rights.isCoHost;
      const verdict = evaluateJoinCapacity({
        maxParticipants: room.maxParticipants,
        activeCount: headcount.count,
        alreadyPresent,
        exempt,
      });
      if (!verdict.allowed) {
        return NextResponse.json(
          { error: "This lounge is full", cap: verdict.cap },
          { status: 409 }
        );
      }
    }
    // headcount.ok === false means we could not ask the database. Admit rather
    // than lock everyone out of every lounge on a transient read failure.
    //
    // Note the count-then-upsert window: two members joining in the same
    // millisecond can both read a headcount below the cap and both be admitted,
    // overshooting by one. Closing it needs a serializable transaction, which is
    // not worth it for a lounge cap; the seat limit is a courtesy guard, not a
    // billing control.
  }

  const input = { sessionId, roomId: room.id, userId: auth.user.uid };
  const result = status === "leave" ? await leaveRoomPresence(input) : await touchRoomPresence(input);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
