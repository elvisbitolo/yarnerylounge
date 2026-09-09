import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getConversation } from "@/lib/server/chat";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

const TYPING_WINDOW_MS = 5000;

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
    const cutoff = new Date(Date.now() - TYPING_WINDOW_MS);
    const prisma = getPrisma();
    const rows = await prisma.typing.findMany({
      where: { conversationId, lastTypedAt: { gte: cutoff } },
    });

    const names = [];
    for (const row of rows) {
      if (row.userId !== user.uid) {
        names.push(row.userName || "Someone");
      }
    }
    return NextResponse.json({ typing: names });
  } catch (err) {
    logError("typing.prisma_list_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load typing" }, { status: 500 });
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
  const limited = rateLimitGuard(`typing:${user.uid}`, { limit: 30 });
  if (limited) return limited;

  const conv = await getConversation(conversationId, user.uid);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const docId = `${conversationId}_${user.uid}`;
  const userDoc = await getUserDoc(user.uid);
  const userName = userDoc?.name || user.name || user.email?.split("@")[0] || "Someone";
  try {
    const prisma = getPrisma();
    await prisma.typing.upsert({
      where: { id: docId },
      create: {
        id: docId,
        conversationId,
        userId: user.uid,
        userName,
        lastTypedAt: new Date(),
      },
      update: {
        userName,
        lastTypedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("typing.upsert_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update typing" }, { status: 500 });
  }
}