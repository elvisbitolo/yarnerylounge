import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getChatSettings, saveChatSettings } from "@/lib/server/chat-settings";

export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = rateLimitGuard(`chat-settings:${user.uid}`, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  return NextResponse.json({ settings: await getChatSettings(user.uid) });
}

export async function PATCH(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = rateLimitGuard(`chat-settings:${user.uid}`, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const settings = await saveChatSettings(user.uid, body);
  if (!settings) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  return NextResponse.json({ settings });
}