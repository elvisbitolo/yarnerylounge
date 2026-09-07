import { NextResponse } from "next/server";
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
import { signJitsiToken, jitsiRoomName, getJitsiAppId } from "@/lib/server/jitsi";

export async function POST(req) {
  try {
    const auth = await requireActiveMember();
    const denied = guardJson(auth);
    if (denied) return denied;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limited = rateLimitGuard(`jitsi-token:${auth.user.uid}`, { limit: 20 });
    if (limited) return limited;
    const limitedIp = rateLimitGuard(`jitsi-token-ip:${ip}`, { limit: 100 });
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
      // Only block before the room has actually opened — an already-open room
      // with a stale `opensAt` timestamp must still be joinable for non-hosts.
      const opensAtMillis = typeof opensAt === "number" ? opensAt : 0;
      const now = Date.now();
      if (opensAtMillis && opensAtMillis > now && !isHost) {
        return NextResponse.json(
          { error: "This room opens at the scheduled time", opensAt: opensAtMillis },
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

    const caps = await getCapabilities(auth.user.uid);
    const canPublishUser = canPublishRemote(caps) || canHost(caps);

    let canPublish = canPublishUser;
    if (room.kind === "broadcast" && !roomHost && !canHost(caps)) {
      canPublish = false;
    }

    const userDoc = await getUserDoc(auth.user.uid);
    const displayName =
      userDoc?.name || auth.user.displayName || auth.user.email?.split("@")[0] || "Member";
    const avatar = userDoc?.photoURL || auth.user.photoURL || "";

    const token = await signJitsiToken({
      identity: auth.user.uid,
      displayName,
      email: auth.user.email || userDoc?.email || "",
      avatar,
      roomName: room.name,
    });

    return NextResponse.json({
      token,
      appId: getJitsiAppId(),
      roomName: jitsiRoomName(room.name),
      canPublish,
      viewerOnly: canPublish === false,
      kind: room.kind || "standard",
      alwaysOn: !!room.alwaysOn,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to generate token" },
      { status: 500 }
    );
  }
}