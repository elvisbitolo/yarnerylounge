import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import {
  getOrCreateDm,
  getOrCreateGroupChat,
  getOrCreateSpaceChat,
  listConversations,
} from "@/lib/server/chat";
import { isGroupMember } from "@/lib/server/groups";
import { isSpaceMember } from "@/lib/server/spaces";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { isEitherMemberBlocked } from "@/lib/server/member-safety";

export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const conversations = await listConversations(user.uid);
  return NextResponse.json({ conversations });
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }

  const { type, otherId, groupId, spaceId } = await req.json();
  if (type === "dm") {
    if (!otherId || otherId === user.uid) {
      return NextResponse.json({ error: "Invalid recipient" }, { status: 400 });
    }
    const limited = rateLimitGuard(`dm:${user.uid}`, { limit: 20 });
    if (limited) return limited;
    let recipientExists = false;
    try {
      const prisma = getPrisma();
      if (!prisma) {
        return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
      }
      const row = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
      recipientExists = !!row;
    } catch (err) {
      logError("conversations.prisma_recipient_failed", { error: err.message });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!recipientExists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (await isEitherMemberBlocked(user.uid, otherId)) {
      return NextResponse.json({ error: "Messaging is unavailable for this member" }, { status: 403 });
    }
    const conversation = await getOrCreateDm(user.uid, otherId);
    return NextResponse.json({ conversation });
  }

  if (type === "group") {
    if (!groupId) {
      return NextResponse.json({ error: "Group required" }, { status: 400 });
    }
    const userDoc = await getUserDoc(user.uid);
    const membership = await isGroupMember(groupId, user.uid);
    if (!membership && userDoc?.role !== "owner") {
      return NextResponse.json({ error: "Join the group first" }, { status: 403 });
    }
    const conversation = await getOrCreateGroupChat(user.uid, groupId);
    if (!conversation) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  }

  if (type === "space") {
    if (!spaceId) {
      return NextResponse.json({ error: "Space required" }, { status: 400 });
    }
    const userDoc = await getUserDoc(user.uid);
    const membership = await isSpaceMember(spaceId, user.uid);
    if (!membership && userDoc?.role !== "owner") {
      return NextResponse.json({ error: "Join the space first" }, { status: 403 });
    }
    const conversation = await getOrCreateSpaceChat(user.uid, spaceId);
    if (!conversation) {
      return NextResponse.json({ error: "Space not found" }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
