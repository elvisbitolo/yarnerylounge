import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { adminDb } from "@/lib/firebase/admin";
import { isGroupMember } from "@/lib/server/groups";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { listTopicThreads, createTopicThread } from "@/lib/server/group-topics";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id: groupId, topicKey } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const topics = await listTopicThreads(groupId, topicKey);
  return NextResponse.json({ threads: topics });
}

export async function POST(req, { params }) {
  const { id: groupId, topicKey } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const membership = await isGroupMember(groupId, user.uid);
  if (!membership) {
    return NextResponse.json({ error: "Join this group to post" }, { status: 403 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const groupSnap = await adminDb().collection("groups").doc(groupId).get();
  if (!groupSnap.exists || groupSnap.data().status !== "active") {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const title = (body.title || "").trim();
  const text = (body.body || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (title.length > 120) {
    return NextResponse.json({ error: "Title must be under 120 characters" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Post must be under 2000 characters" }, { status: 400 });
  }

  const userDoc = await getUserDoc(user.uid);
  const created = await createTopicThread({
    groupId,
    topicKey,
    uid: user.uid,
    userName: userDoc?.name || user.name || "Member",
    title,
    body: text,
  });
  return NextResponse.json(created, { status: 201 });
}