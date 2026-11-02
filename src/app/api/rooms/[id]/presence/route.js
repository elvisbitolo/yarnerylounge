import { NextResponse, after } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { requireRoomAccess } from "@/lib/server/room-access";
import {
  getRoomPresence,
  leaveRoomPresence,
  touchRoomPresence,
  claimRoomPresenceWithinCapacity,
} from "@/lib/server/room-presence";
import { getScopedHostRights } from "@/lib/server/hosts";
import { notifySecretYarneryRoom, notifyWatchersRoom } from "@/lib/server/member-watch";

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

  const input = { sessionId, roomId: room.id, userId: auth.user.uid };
  let result;
  if (status === "leave") {
    result = await leaveRoomPresence(input);
  } else if (status === "heartbeat") {
    // Existing members must keep their seat even when the room is now full.
    result = await touchRoomPresence(input);
  } else {
    const rights = await getScopedHostRights(auth.user.uid, "room", room.id);
    const exempt =
      auth.userDoc?.role === "owner" ||
      auth.userDoc?.role === "moderator" ||
      rights.isHost ||
      rights.isCoHost;
    result = await claimRoomPresenceWithinCapacity({
      ...input,
      maxParticipants: room.maxParticipants,
      exempt,
    });
    if (result.full) {
      return NextResponse.json(
        { error: "This lounge is full", cap: result.cap },
        { status: 409 }
      );
    }
  }
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
  if (status === "join" && result.newEntry) {
    // Secret Yarnery's owner activity is announced to eligible members;
    // ordinary members continue to notify only their explicit watchers.
    // The owner check is performed against the persisted account email.
    after(async () => {
      const broadcast = await notifySecretYarneryRoom(auth.user.uid, room);
      if (broadcast.skipped) await notifyWatchersRoom(auth.user.uid, room);
    });
  }
  return NextResponse.json({ ok: true });
}
