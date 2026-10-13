import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getAppearance, saveAppearance } from "@/lib/server/chat-appearance";
import { getConversation } from "@/lib/server/chat";

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

export async function GET() {
  const user = await required();
  if (user instanceof NextResponse) return user;

  const limited = rateLimitGuard(`chat-appearance:${user.uid}`, { limit: 240 });
  if (limited) return limited;

  const appearance = await getAppearance(user.uid);
  return NextResponse.json({ appearance });
}

export async function PATCH(req) {
  const user = await required();
  if (user instanceof NextResponse) return user;

  const limited = rateLimitGuard(`chat-appearance:${user.uid}`, { limit: 300 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";

  if (conversationId) {
    const conv = await getConversation(conversationId, user.uid);
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  }

  const appearance = await saveAppearance(user.uid, body, conversationId);
  if (!appearance) {
    return NextResponse.json({ error: "Couldn't save" }, { status: 400 });
  }
  return NextResponse.json({ appearance });
}