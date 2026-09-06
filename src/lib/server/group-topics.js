import { adminDb } from "@/lib/firebase/admin";

export const TOPIC_DEFS = [
  {
    key: "future-wimps",
    name: "Future WIMPs",
    description: "Dream projects, planned object list, and ideas you want to start.",
    emoji: "🌱",
    order: 0,
  },
  {
    key: "current-wimps",
    name: "Current WIMPs",
    description: "Works in progress right now — updates, stalls, and wins.",
    emoji: "🧶",
    order: 1,
  },
  {
    key: "pattern-help",
    name: "Pattern help",
    description: "Stuck on a stitch, chart, gauge, or acronym? Ask here.",
    emoji: "📐",
    order: 2,
  },
  {
    key: "inspiration",
    name: "Inspiration",
    description: "Colors, yarns, finished objects, and mood boards that spark ideas.",
    emoji: "✨",
    order: 3,
  },
];

function topicDocId(groupId, topicKey) {
  return `${groupId}_${topicKey}`;
}

export async function ensureGroupTopics(groupId) {
  const existing = await adminDb()
    .collection("groupTopics")
    .where("groupId", "==", groupId)
    .get();
  const seen = new Set(existing.docs.map((d) => d.id));
  const batch = adminDb().batch();
  for (const def of TOPIC_DEFS) {
    const id = topicDocId(groupId, def.key);
    if (seen.has(id)) continue;
    batch.set(adminDb().collection("groupTopics").doc(id), {
      groupId,
      key: def.key,
      name: def.name,
      description: def.description,
      emoji: def.emoji,
      order: def.order,
      status: "active",
      createdAt: new Date(),
    });
  }
  await batch.commit();
}

export async function ensureTopicsForAllGroups() {
  const groupsSnap = await adminDb()
    .collection("groups")
    .where("status", "==", "active")
    .get();
  let count = 0;
  for (const doc of groupsSnap.docs) {
    await ensureGroupTopics(doc.id);
    count += 1;
  }
  return count;
}

export async function listGroupTopics(groupId) {
  await ensureGroupTopics(groupId);
  const snap = await adminDb()
    .collection("groupTopics")
    .where("groupId", "==", groupId)
    .orderBy("order", "asc")
    .get();
  const threads = await adminDb()
    .collection("topicThreads")
    .where("groupId", "==", groupId)
    .get();
  const counts = {};
  for (const doc of threads.docs) {
    const key = doc.data().topicKey;
    counts[key] = (counts[key] || 0) + 1;
  }
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      key: data.key,
      name: data.name,
      description: data.description,
      emoji: data.emoji,
      threadCount: counts[data.key] || 0,
    };
  });
}

export async function listTopicThreads(groupId, topicKey) {
  const snap = await adminDb()
    .collection("topicThreads")
    .where("groupId", "==", groupId)
    .where("topicKey", "==", topicKey)
    .orderBy("lastActivityAt", "desc")
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function getTopicThread(threadId) {
  const doc = await adminDb().collection("topicThreads").doc(threadId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

export async function createTopicThread({
  groupId,
  topicKey,
  uid,
  userName,
  title,
  body,
}) {
  const now = new Date();
  const ref = adminDb().collection("topicThreads").doc();
  await ref.set({
    groupId,
    topicKey,
    authorId: uid,
    authorName: userName || "Member",
    title,
    body,
    pinned: false,
    replyCount: 0,
    createdAt: now,
    lastActivityAt: now,
  });
  await adminDb()
    .collection("groupTopics")
    .doc(topicDocId(groupId, topicKey))
    .set({ lastActivityAt: now }, { merge: true });
  return { id: ref.id };
}

export async function listThreadReplies(threadId) {
  const snap = await adminDb()
    .collection("topicReplies")
    .where("threadId", "==", threadId)
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function addThreadReply({ threadId, groupId, topicKey, uid, userName, text }) {
  const now = new Date();
  const threadDoc = adminDb().collection("topicThreads").doc(threadId);
  const threadSnap = await threadDoc.get();
  if (!threadSnap.exists) {
    return { error: "Thread not found" };
  }
  const threadData = threadSnap.data();

  const ref = adminDb().collection("topicReplies").doc();
  await ref.set({
    threadId,
    groupId,
    topicKey,
    authorId: uid,
    authorName: userName || "Member",
    text,
    createdAt: now,
  });
  const replyCount = (threadData.replyCount || 0) + 1;
  await threadDoc.update({
    replyCount,
    lastActivityAt: now,
  });
  await adminDb()
    .collection("groupTopics")
    .doc(topicDocId(groupId, topicKey))
    .set({ lastActivityAt: now }, { merge: true });

  if (threadData.authorId && threadData.authorId !== uid) {
    const groupDoc = await adminDb().collection("groups").doc(groupId).get();
    const slug = groupDoc.exists ? groupDoc.data().slug : "";
    const { createNotification } = await import("@/lib/server/notifications");
    await createNotification({
      userId: threadData.authorId,
      type: "comment",
      actorId: uid,
      actorName: userName || "Member",
      targetId: threadId,
      href: `/groups/${slug}`,
      text: `Replied on “${threadData.title || "your thread"}”`,
    });
  }
  return { id: ref.id };
}