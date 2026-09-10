import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { listConversations, unreadCount } from "@/lib/server/chat";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = rateLimitGuard(`chat-summary:${user.uid}`, { limit: 120 });
  if (limited) return limited;

  const conversations = await listConversations(user.uid);
  const unread = await unreadCount(user.uid);
  return NextResponse.json({
    unread,
    conversations: conversations.slice(0, 8),
  });
}
