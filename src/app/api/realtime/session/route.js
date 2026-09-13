import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/server/auth";
import { parseSessionCookie } from "@/lib/server/auth-core";
import { resolveSession } from "@/lib/server/session-store";
import { getConversation } from "@/lib/server/chat";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

// Hands the browser the member's short-lived Supabase access token so the
// client can open a Realtime WebSocket (with RLS) and receive chat changes
// instantly. The token is minted by Supabase Auth at login, lives server-side
// in the Session row, and is only released to an authenticated participant of
// the requested conversation. Server components still resolve/renew tokens
// against the same Session row, so expiry here is handled transparently.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`realtime-session:${user.uid}`, { limit: 240 });
  if (limited) return limited;

  let conversationId = "";
  try {
    const body = await req.json();
    conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Optional: when a conversation is supplied, the requester must be a
  // participant. Without one (inbox rail subscription) the member's own token
  // is returned and Realtime's RLS still scopes every row to their cos.
  if (conversationId) {
    const conv = await getConversation(conversationId, user.uid);
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  }

  const cookieStore = await cookies();
  const sid = parseSessionCookie(cookieStore.get("community-auth")?.value)?.sid;
  if (!sid) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const resolved = await resolveSession(sid);
  if (!resolved?.session?.accessToken || resolved?.identity?.uid !== user.uid) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const expSeconds = parseJwtExp(resolved.session.accessToken);

  return NextResponse.json({
    accessToken: resolved.session.accessToken,
    expiresAt: expSeconds,
  });
}

function parseJwtExp(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const pad = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return typeof parsed?.exp === "number" ? parsed.exp : 0;
  } catch {
    return 0;
  }
}