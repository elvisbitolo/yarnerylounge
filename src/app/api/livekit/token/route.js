import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { getRoomBySlug } from "@/lib/server/rooms";
import { getSpace, isSpaceMember } from "@/lib/server/spaces";
import { getUpcomingRoomStart } from "@/lib/server/events";
import {
  requireActiveMember,
  requireGroupMember,
  guardJson,
} from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getScopedHostRights } from "@/lib/server/hosts";
import { getUserDoc } from "@/lib/server/auth";
import { getCapabilities, canPublishRemote, canHost } from "@/lib/server/capabilities";

export async function POST(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`livekit-token:${auth.user.uid}`, { limit: 20 });
  if (limited) return limited;
  const limitedIp = rateLimitGuard(`livekit-token-ip:${ip}`, { limit: 100 });
  if (limitedIp) return limitedIp;

  const { slug } = await req.json();
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Room required" }, { status: 400 });
  }

  const room = await getRoomBySlug(slug);
  if (!room || room.status !== "active") {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const rights = await getScopedHostRights(auth.user.uid, "room", room.id);
  const isHost = rights.isHost;
  const isCoHost = rights.isCoHost;

  if (!room.alwaysOn) {
    let opensAt = await getUpcomingRoomStart(room.slug);
    if (!opensAt && room.opensAt) opensAt = room.opensAt.toMillis?.() || 0;
    if (opensAt && !isHost) {
      return NextResponse.json(
        { error: "This room opens at the scheduled time", opensAt },
        { status: 423 }
      );
    }
  }

  const roomHost = isHost || isCoHost;

  if (room.spaceId) {
    const space = await getSpace(room.spaceId);
    if (!space || space.status !== "active") {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    if (!roomHost) {
      const membership = await isSpaceMember(room.spaceId, auth.user.uid);
      if (!membership) {
        return NextResponse.json({ error: "Join the space first" }, { status: 403 });
      }
    }
  }

  if (room.groupId && !roomHost) {
    const groupAuth = await requireGroupMember(room.groupId);
    const groupDenied = guardJson(groupAuth);
    if (groupDenied) return groupDenied;
  }

  // Moving In (host) can always publish; free/Flirting are view-only (muted).
  const caps = await getCapabilities(auth.user.uid);
  const canPublishUser = canPublishRemote(caps) || canHost(caps);

  let canPublish = canPublishUser;
  if (room.kind === "broadcast" && !roomHost && !canHost(caps)) {
    canPublish = false;
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "LiveKit not configured" }, { status: 500 });
  }

  const identity = auth.user.uid;
  const userDoc = await getUserDoc(identity);
  const displayName =
    userDoc?.name || auth.user.displayName || auth.user.email?.split("@")[0] || "Member";
  const avatar = userDoc?.photoURL || auth.user.photoURL || "";

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: displayName,
    metadata: JSON.stringify({
      id: identity,
      name: displayName,
      avatar,
    }),
    ttl: room.alwaysOn ? "24h" : "4h",
  });
  at.addGrant({
    room: room.slug,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
  });

  return NextResponse.json({
    token: await at.toJwt(),
    serverUrl: process.env.LIVEKIT_URL,
    room: room.slug,
    kind: room.kind || "standard",
    canPublish,
    alwaysOn: !!room.alwaysOn,
  });
}
