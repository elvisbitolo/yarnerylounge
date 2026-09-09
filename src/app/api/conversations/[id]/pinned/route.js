import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getConversation } from "@/lib/server/chat";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET(req, { params }) {
  const { id: conversationId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const conv = await getConversation(conversationId, user.uid);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  try {
    const prisma = getPrisma();
    const rows = await prisma.conversationMessage.findMany({
      where: { conversationId, pinned: true },
      orderBy: { pinnedAt: "desc" },
      take: 10,
    });
    const messages = rows.map((r) => ({
      id: r.id,
      senderId: r.senderId,
      senderName: r.senderName,
      pinnedAt: r.pinnedAt ? new Date(r.pinnedAt).getTime() : 0,
    }));
    return NextResponse.json({ messages });
  } catch (err) {
    logError("conversation.pin.prisma_list_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load pinned messages" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  const { id: conversationId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const limited = rateLimitGuard(`pin:${user.uid}`, { limit: 30 });
  if (limited) return limited;

  const conv = await getConversation(conversationId, user.uid);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";
  if (!messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }

  let message = null;
  try {
    const prisma = getPrisma();
    const row = await prisma.conversationMessage.findUnique({
      where: { id: messageId },
      select: { conversationId: true, pinned: true },
    });
    if (!row || row.conversationId !== conversationId) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    message = row;
  } catch (err) {
    logError("conversation.pin.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const isPinned = !!message.pinned;
  try {
    const prisma = getPrisma();
    await prisma.conversationMessage.update({
      where: { id: messageId },
      data: isPinned
        ? { pinned: false, pinnedAt: null }
        : { pinned: true, pinnedAt: new Date() },
    });
    return NextResponse.json({ pinned: !isPinned });
  } catch (err) {
    logError("conversation.pin.update_prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update pin" }, { status: 500 });
  }
}