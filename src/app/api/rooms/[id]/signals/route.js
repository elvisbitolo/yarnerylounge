import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getUserDoc } from "@/lib/server/auth";
import { getScopedHostRights } from "@/lib/server/hosts";
import {
  getRoomForSignals,
  addRoomSignal,
  listRoomSignals,
  ROOM_SIGNAL_TYPES,
} from "@/lib/server/room-signals";

export async function GET(req, { params }) {
  const { id: roomId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`room-signals:${auth.user.uid}`, { limit: 600 });
  if (limited) return limited;

  const room = await getRoomForSignals(roomId);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const storageRoomId = room.id;

  const rawAfter = req.nextUrl.searchParams.get("after");
  const after = Number(rawAfter);
  const { signals, hasMore } = await listRoomSignals(storageRoomId, {
    after: Number.isFinite(after) && after > 0 ? after : 0,
  });
  return NextResponse.json({ signals, hasMore });
}

export async function POST(req, { params }) {
  const { id: roomId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`room-signal:${auth.user.uid}`, { limit: 180 });
  if (limited) return limited;

  const room = await getRoomForSignals(roomId);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const storageRoomId = room.id;

  const body = await req.json().catch(() => ({}));
  const type = typeof body?.type === "string" ? body.type.trim() : "";
  if (!ROOM_SIGNAL_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid signal type" }, { status: 400 });
  }

  const target = typeof body?.target === "string" ? body.target.trim().slice(0, 128) : "";
  const emoji =
    typeof body?.emoji === "string" ? body.emoji.trim().slice(0, 8) : "";

  const userDoc = await getUserDoc(auth.user.uid);
  const rights = await getScopedHostRights(auth.user.uid, "room", storageRoomId);
  const isHostPower = !!userDoc && (userDoc.role === "owner" || userDoc.role === "moderator" || rights.isHost || rights.isCoHost);

  const payload = { type, value: !!body?.value, target, emoji };

  if (type === "speakerInvite") {
    if (!isHostPower) {
      return NextResponse.json({ error: "Host required" }, { status: 403 });
    }
    if (!target) {
      return NextResponse.json({ error: "Target required" }, { status: 400 });
    }
    payload.hostName = userDoc?.name || auth.user.name || auth.user.email?.split("@")[0] || "Host";
    await addRoomSignal(storageRoomId, auth.user.uid, payload);
    return NextResponse.json({ ok: true });
  }

  if (type === "reaction") {
    if (!emoji) {
      return NextResponse.json({ error: "Emoji required" }, { status: 400 });
    }
    await addRoomSignal(storageRoomId, auth.user.uid, payload);
    return NextResponse.json({ ok: true });
  }

  if (type === "hand") {
    if (target && !isHostPower) {
      return NextResponse.json({ error: "Host required" }, { status: 403 });
    }
    await addRoomSignal(storageRoomId, auth.user.uid, payload);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid signal" }, { status: 400 });
}
