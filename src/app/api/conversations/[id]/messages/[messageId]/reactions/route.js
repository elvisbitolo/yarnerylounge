import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getConversation } from "@/lib/server/chat";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "👏", "💯", "🧶", "⭐"];

export async function POST(req, { params }) {
  const { id: conversationId, messageId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const limited = rateLimitGuard(`reaction:${user.uid}`, { limit: 60 });
  if (limited) return limited;

  const conv = await getConversation(conversationId, user.uid);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";
  if (!emoji || !QUICK_EMOJIS.includes(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  let message = null;
  try {
    const prisma = getPrisma();
    const row = await prisma.conversationMessage.findUnique({
      where: { id: messageId },
      select: { conversationId: true, reactions: true },
    });
    if (!row || row.conversationId !== conversationId) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    message = row;
  } catch (err) {
    logError("conversation.reaction.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const reactions = message.reactions || {};
  const alreadyReacted = reactions[emoji]?.[user.uid];

  try {
    const prisma = getPrisma();
    const next = { ...reactions };
    const bucket = { ...(next[emoji] || {}) };
    if (alreadyReacted) {
      delete bucket[user.uid];
    } else {
      bucket[user.uid] = true;
    }
    next[emoji] = bucket;
    await prisma.conversationMessage.update({
      where: { id: messageId },
      data: { reactions: next },
    });
    return NextResponse.json({ reactions: next });
  } catch (err) {
    logError("conversation.reaction.update_prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update reaction" }, { status: 500 });
  }
}