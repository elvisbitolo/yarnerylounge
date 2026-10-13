import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getConversation } from "@/lib/server/chat";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { saveConversationPrefs } from "@/lib/server/chat-settings";
import { resolveChatPrefs } from "@/lib/chat-settings-core";

// Per-conversation chat preferences: mute (with what's left of the window),
// pin to top, archive. Only the viewer's own conversation prefs; the
// conversation itself is untouched, so membership is the only gate needed.
export async function PATCH(req, { params }) {
  const { conversationId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = rateLimitGuard(`chat-conv-settings:${user.uid}`, { limit: 90, windowMs: 60_000 });
  if (limited) return limited;

  const conv = await getConversation(conversationId, user.uid);
  if (!conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const saved = await saveConversationPrefs(user.uid, conversationId, body);
  if (!saved) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  return NextResponse.json({ prefs: resolveChatPrefs(saved), prefsRaw: saved });
}