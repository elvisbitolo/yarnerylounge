import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getUserDoc, canModerate } from "@/lib/server/auth";
import { getScopedHostRights } from "@/lib/server/hosts";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import {
  getRoomForChat,
  listRoomMessages,
  addRoomMessage,
  ROOM_MESSAGE_MAX,
} from "@/lib/server/room-messages";

async function roleFor(roomId, userDoc, uid) {
  if (userDoc?.role === "owner" || userDoc?.role === "moderator") {
    return userDoc.role;
  }
  const rights = await getScopedHostRights(uid, "room", roomId);
  if (rights.isHost) return "host";
  if (rights.isCoHost) return "moderator";
  return "speaker";
}

function parseCursor(url) {
  const before = url.searchParams.get("before");
  if (!before) return null;
  const ts = Number(before);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

function parseAfter(url) {
  const after = url.searchParams.get("after");
  if (!after) return null;
  const ts = Number(after);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

const IMAGE_DATA_RE = /^data:image\/(png|jpe?g|gif|webp);base64,/;

function validImageData(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  if (!IMAGE_DATA_RE.test(v)) return false;
  if (v.length > 700 * 1024) return false;
  return true;
}

export async function GET(req, { params }) {
  const { id: roomId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`room-msgs:${auth.user.uid}`, { limit: 240 });
  if (limited) return limited;

  const room = await getRoomForChat(roomId);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const storageRoomId = room.id;

  const limit = Number(req.nextUrl.searchParams.get("limit")) || 50;
  const before = parseCursor(req.nextUrl);
  const after = parseAfter(req.nextUrl);
  const { messages, hasMore } = await listRoomMessages(storageRoomId, { before, after, limit, viewerId: auth.user.uid });
  return NextResponse.json({ messages, hasMore });
}

export async function POST(req, { params }) {
  const { id: roomId } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`room-message:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;

  const room = await getRoomForChat(roomId);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const storageRoomId = room.id;

  const userDoc = await getUserDoc(auth.user.uid);
  const caps = await getCapabilities(auth.user.uid);
  const hostRights = await getScopedHostRights(auth.user.uid, "room", storageRoomId);
  const canWriteAnyway =
    canModerate(userDoc) || hostRights.isHost || hostRights.isCoHost;
  if (!canWriteChat(caps) && !canWriteAnyway) {
    return NextResponse.json(
      { error: "Upgrade to chat with the group!" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const hasImage = validImageData(body?.imageData);
  if (!text && !hasImage) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  if (text.length > ROOM_MESSAGE_MAX) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }

  const mentions = Array.isArray(body?.mentions)
    ? body.mentions.filter((m) => typeof m === "string").slice(0, 30)
    : [];
  let replyTo = null;
  if (body?.replyTo && typeof body.replyTo === "object") {
    replyTo = {
      id: String(body.replyTo.id || "").slice(0, 64),
      text: String(body.replyTo.text || "").slice(0, 120),
      from: String(body.replyTo.from || "").slice(0, 64),
    };
  }

  const senderName = userDoc?.name || auth.user.name || auth.user.email?.split("@")[0] || "Member";
  const role = await roleFor(storageRoomId, userDoc, auth.user.uid);

  const messageId = await addRoomMessage(
    storageRoomId,
    {
      uid: auth.user.uid,
      name: senderName,
      avatar: userDoc?.photoURL || auth.user.photoURL || "",
      role,
    },
    { text, mentions, replyTo, imageData: hasImage ? body.imageData.trim() : "" }
  );

  if (!messageId) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  return NextResponse.json({ id: messageId });
}
