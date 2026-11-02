import { NextResponse, after } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { requireRoomAccess } from "@/lib/server/room-access";
import {
  getRoomPresence,
  leaveRoomPresence,
  touchRoomPresence,
  touchRoomPresenceAndDetectEntry,
  countActiveRoomParticipants,
  hasActiveRoomPresence,
} from "@/lib/server/room-presence";
import { evaluateJoinCapacity } from "@/lib/server/room-capacity-core";
import { getScopedHostRights } from "@/lib/server/hosts";
import { notifySecretYarneryRoom, notifyWatchersRoom } from "@/lib/server/member-watch";
import { announceLoungeLive } from "@/lib/server/lounge-live";
import { isLoungeLiveEnabled } from "@/lib/server/lounge-live-core";

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
  //
  // `alreadyPresent` is used only by the capacity guard. The atomic
  // presence helper below independently decides whether this is a first entry
  // and therefore eligible for an owner lounge announcement.
  let alreadyPresent = false;
  if (status !== "leave") {
    const [headcount, rights, present] = await Promise.all([
      countActiveRoomParticipants(room.id),
      getScopedHostRights(auth.user.uid, "room", room.id),
      hasActiveRoomPresence(room.id, auth.user.uid),
    ]);
    alreadyPresent = present;
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
  const result = status === "leave"
    ? await leaveRoomPresence(input)
    : status === "join"
      ? await touchRoomPresenceAndDetectEntry(input)
      : await touchRoomPresence(input);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
  if (status === "join" && result.newEntry) {
    // This is the first point at which we know the member actually entered
    // the Jitsi conference. A prewarmed token must never count as attendance.
    after(async () => {
      if (room.persisted) {
        const joinedAt = new Date();
        if (isLoungeLiveEnabled()) {
          await announceLoungeLive({
            user: {
              uid: auth.user.uid,
              email: auth.user.email || auth.userDoc?.email || "",
              name: auth.userDoc?.name || auth.user.displayName || "Member",
            },
            room: { id: room.id, name: room.name, slug: room.slug },
            now: joinedAt.getTime(),
            sessionId,
          });
        }
        // Record only after the announcement checks the previous join history;
        // this also removes the former create-vs-query race.
        const prisma = getPrisma();
        if (prisma) {
          await prisma.roomEvent.create({
            data: { userId: auth.user.uid, roomId: room.id, roomName: room.name, joinedAt },
          }).catch((err) => console.error("roomEvent.record_failed", err));
        }
      }
      const broadcast = await notifySecretYarneryRoom(auth.user.uid, room);
      if (broadcast.skipped) await notifyWatchersRoom(auth.user.uid, room);
    });
  }
  return NextResponse.json({ ok: true });
}
