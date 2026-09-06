import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import { isGroupMember } from "@/lib/server/groups";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { listThreadReplies, addThreadReply, getTopicThread } from "@/lib/server/group-topics";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { threadId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const replies = await listThreadReplies(threadId);
  return NextResponse.json({ replies });
}

export async function POST(req, { params }) {
  const { id: groupId, topicKey, threadId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const thread = await getTopicThread(threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  const membership = await isGroupMember(groupId, user.uid);
  if (!membership) {
    return NextResponse.json({ error: "Join this group to reply" }, { status: 403 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const userDoc = await getUserDoc(user.uid);
  const caps = await getCapabilities(user.uid);
  if (!canWriteChat(caps) && !canModerate(userDoc)) {
    return NextResponse.json(
      { error: "Upgrade to chat with the group!" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Reply is required" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Reply must be under 2000 characters" }, { status: 400 });
  }

  const created = await addThreadReply({
    threadId,
    groupId,
    topicKey,
    uid: user.uid,
    userName: userDoc?.name || user.name || "Member",
    text,
  });
  if (created.error) {
    return NextResponse.json({ error: created.error }, { status: 404 });
  }
  return NextResponse.json(created, { status: 201 });
}