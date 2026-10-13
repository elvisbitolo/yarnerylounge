import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getMessageInfo } from "@/lib/server/chat-stars";

export async function GET(req, { params }) {
  const { messageId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const limited = rateLimitGuard(`chat-msg-info:${user.uid}`, { limit: 300 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId") || "";
  if (!conversationId || !messageId) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const info = await getMessageInfo(user.uid, conversationId, messageId);
  if (!info) {
    return NextResponse.json({ error: "Message not found in this conversation" }, { status: 404 });
  }
  return NextResponse.json(info);
}