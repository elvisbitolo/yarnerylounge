import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { hasSearchQuery } from "@/lib/chat-search-core";
import { searchChatHistory, searchMembersForChat } from "@/lib/server/chat-search";

export const dynamic = "force-dynamic";

// One search box, two answers: the searcher's conversations (matched against
// full message history, which is why this is a server route at all) and the
// members whose name or username matches, so a chat can be started from the
// same field.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Debounced typing, so a burst is still a handful of calls; this is only a
  // ceiling for a runaway loop.
  const limited = rateLimitGuard(`chat-search:${user.uid}`, { limit: 90 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!hasSearchQuery(q)) {
    return NextResponse.json({ conversations: [], members: [] });
  }

  const [conversations, members] = await Promise.all([
    searchChatHistory(user.uid, q),
    searchMembersForChat(user.uid, q),
  ]);

  return NextResponse.json({ conversations, members });
}
