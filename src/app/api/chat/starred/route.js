import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getStarredMessagesFor, saveMessageStar } from "@/lib/server/chat-stars";

async function required(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  return user;
}

export async function GET(req) {
  const user = await required(req);
  if (user instanceof NextResponse) return user;

  const limited = rateLimitGuard(`chat-stars:${user.uid}`, { limit: 240 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId") || "";
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  const messages = await getStarredMessagesFor(user.uid, conversationId);
  return NextResponse.json({ messages });
}

export async function PATCH(req) {
  const user = await required(req);
  if (user instanceof NextResponse) return user;

  const limited = rateLimitGuard(`chat-stars:${user.uid}`, { limit: 300 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";
  const starred = body?.starred === true || body?.starred === false ? body.starred : null;
  if (!conversationId || !messageId || starred === null) {
    return NextResponse.json({ error: "conversationId, messageId and starred required" }, { status: 400 });
  }

  const saved = await saveMessageStar(user.uid, conversationId, messageId, starred);
  if (saved === null) {
    return NextResponse.json({ error: "Message not found in this conversation" }, { status: 404 });
  }
  return NextResponse.json({ starred: saved });
}