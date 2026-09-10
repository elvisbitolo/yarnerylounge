import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
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
import { getUserDoc, canModerate } from "@/lib/server/auth";
import { getCapabilities, canPublishRemote, canHost } from "@/lib/server/capabilities";
import {
  buildJitsiTokenPayload,
  jitsiRoomName,
  getJitsiAppId,
  getJitsiApiKeyId,
  getJitsiPrivateKey,
  isJitsiConfigured,
  describeJitsiToken,
} from "@/lib/server/jitsi";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";
import { toMillis } from "@/lib/server/user-core";

// Development-only diagnostic sink. Never logs the token itself or the key.
function logJwtDiagnostics(token) {
  if (process.env.JAAS_TOKEN_DEBUG === "true") {
    console.info("[jaas] JWT validation:", describeJitsiToken(token));
  }
}

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

    const { slug } = await req.json().catch(() => ({}));
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
      if (!opensAt && room.opensAt) opensAt = toMillis(room.opensAt);
      // Only block before the room has actually opened — an already-open room
      // with a stale `opensAt` timestamp must still be joinable for non-hosts.
      const opensAtMillis = toMillis(opensAt);
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

    if (!isJitsiConfigured()) {
      // Granular diagnostics (no secrets). The two guards left in
      // isJitsiConfigured are `apiKeyId !== appId` and the key starting with
      // "-----BEGIN" — so we record exactly which one fails.
      const appIdV = getJitsiAppId();
      const keyIdV = getJitsiApiKeyId();
      const keyV = getJitsiPrivateKey();
      const keyLines = keyV ? keyV.split(/\r?\n/) : [];
      logError("jitsi.token.not_configured", {
        appId: appIdV ? "set" : "missing",
        appIdStart: appIdV ? appIdV.slice(0, 24) : "",
        apiKeyId: keyIdV ? "set" : "missing",
        apiKeyIdStart: keyIdV ? keyIdV.slice(0, 24) : "",
        apiKeyIdEqualsAppId: keyIdV === appIdV,
        keyIdVar: process.env.JITSI_KEY_ID ? "set" : "missing",
        apiKeyIdVar: process.env.JITSI_API_KEY_ID ? "set" : "missing",
        privateKey: keyV ? "set" : "missing",
        privateKeyHeaderOk: keyV ? keyV.startsWith("-----BEGIN") : false,
        privateKeyStart: keyLines[0] ? keyLines[0].slice(0, 30) : "",
        keyLineCount: keyLines.filter(Boolean).length,
        keyLength: keyV ? keyV.length : 0,
      });
      return NextResponse.json(
        { error: "Unable to join this room. Please try again.", code: "jaas_not_configured" },
        { status: 503 }
      );
    }

    // Moderator powers (JaaS context.user.moderator + recording feature) go to
    // staff and to the room's host/co-host only — regular participants get a
    // plain member token with every feature permission off.
    const isModerator = canModerate({ role: userDoc?.role }) || isHost || isCoHost;

    // Sign the RS256 JaaS JWT inline. The header MUST be
    // { alg: "RS256", kid: <API Key ID>, typ: "JWT" } — JaaS looks the "kid"
    // up in the console before verifying the signature, so a missing or wrong
    // kid fails every join. JITSI_KEY_ID is preferred, JITSI_API_KEY_ID is the
    // fallback (see getJitsiApiKeyId).
    const started = Date.now();
    const token = jwt.sign(
      buildJitsiTokenPayload({
        appId: getJitsiAppId(),
        identity: auth.user.uid,
        displayName,
        email: auth.user.email || userDoc?.email || "",
        avatar,
        roomName: room.name,
        moderator: isModerator,
        recording: isModerator,
      }),
      getJitsiPrivateKey(),
      {
        algorithm: "RS256",
        header: { alg: "RS256", kid: getJitsiApiKeyId(), typ: "JWT" },
      }
    );
    if (process.env.JAAS_TOKEN_DEBUG === "true") {
      console.info(`[jaas] token minted in ${Date.now() - started}ms`);
    }
    logJwtDiagnostics(token);

    const prisma = getPrisma();
    prisma.roomEvent
      .create({
        data: {
          userId: auth.user.uid,
          roomId: room.id,
          roomName: room.name,
          joinedAt: new Date(),
        },
      })
      .catch((err) => console.error("roomEvent.record_failed", err));

    return NextResponse.json({
      token,
      appId: getJitsiAppId(),
      roomName: jitsiRoomName(room.name),
      canPublish,
      moderator: isModerator,
      viewerOnly: canPublish === false,
      kind: room.kind || "standard",
      alwaysOn: !!room.alwaysOn,
    });
  } catch (err) {
    // Never leak internal JaaS/JWT details (kid/iss/keys) to the client.
    logError("jitsi.token.failed", { error: err?.message });
    return NextResponse.json(
      { error: "Unable to join this room. Please try again.", code: "jaas_join_error" },
      { status: 500 }
    );
  }
}