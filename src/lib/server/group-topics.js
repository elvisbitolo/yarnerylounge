import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

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

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

export async function ensureGroupTopics(groupId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.groupTopic.findMany({ where: { groupId } });
      const seen = new Set(existing.map((r) => r.key));
      for (const def of TOPIC_DEFS) {
        if (seen.has(def.key)) continue;
        await prisma.groupTopic.create({
          data: {
            id: topicDocId(groupId, def.key),
            groupId,
            key: def.key,
            name: def.name,
            description: def.description,
            emoji: def.emoji,
            order: def.order,
            status: "active",
            createdAt: new Date(),
          },
        });
      }
    } catch (err) {
      logError("group-topics.prisma_ensure_failed", { error: err.message });
    }
  }
}

export async function ensureTopicsForAllGroups() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const groups = await prisma.group.findMany({ where: { status: "active" } });
      for (const group of groups) {
        await ensureGroupTopics(group.id);
      }
      return groups.length;
    } catch (err) {
      logError("group-topics.prisma_ensure_all_failed", { error: err.message });
    }
  }
  return 0;
}

export async function listGroupTopics(groupId) {
  await ensureGroupTopics(groupId);
  const prisma = getPrisma();
  if (prisma) {
    try {
      const topics = await prisma.groupTopic.findMany({
        where: { groupId },
        orderBy: { order: "asc" },
      });
      const threadCounts = await prisma.topicThread.groupBy({
        by: ["topicKey"],
        where: { groupId },
        _count: { id: true },
      });
      const countsMap = {};
      for (const row of threadCounts) {
        countsMap[row.topicKey] = row._count.id;
      }
      return topics.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        description: t.description || "",
        emoji: t.emoji || "",
        threadCount: countsMap[t.key] || 0,
      }));
    } catch (err) {
      logError("group-topics.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function listTopicThreads(groupId, topicKey) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.topicThread.findMany({
        where: { groupId, topicKey },
        orderBy: { lastActivityAt: "desc" },
      });
      return rows.map((r) => ({
        id: r.id,
        groupId: r.groupId,
        topicKey: r.topicKey,
        authorId: r.authorId,
        authorName: r.authorName || "",
        title: r.title,
        body: r.body,
        pinned: r.pinned,
        replyCount: r.replyCount,
        createdAt: toMillisValue(r.createdAt),
        lastActivityAt: toMillisValue(r.lastActivityAt),
      }));
    } catch (err) {
      logError("group-topics.prisma_list_threads_failed", { error: err.message });
    }
  }
  return [];
}

export async function getTopicThread(threadId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.topicThread.findUnique({ where: { id: threadId } });
      if (row) {
        return {
          id: row.id,
          groupId: row.groupId,
          topicKey: row.topicKey,
          authorId: row.authorId,
          authorName: row.authorName || "",
          title: row.title,
          body: row.body,
          pinned: row.pinned,
          replyCount: row.replyCount,
          createdAt: toMillisValue(row.createdAt),
          lastActivityAt: toMillisValue(row.lastActivityAt),
        };
      }
      return null;
    } catch (err) {
      logError("group-topics.prisma_get_thread_failed", { error: err.message });
    }
  }
  return null;
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
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.topicThread.create({
        data: {
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
        },
      });
      await prisma.groupTopic.update({
        where: { groupId_key: { groupId, key: topicKey } },
        data: { lastActivityAt: now },
      }).catch(() => {});
      return { id: created.id };
    } catch (err) {
      logError("group-topics.prisma_create_thread_failed", { error: err.message });
    }
  }
  return { id: "" };
}

export async function listThreadReplies(threadId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.topicReply.findMany({
        where: { threadId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        threadId: r.threadId,
        groupId: r.groupId,
        topicKey: r.topicKey || "",
        authorId: r.authorId,
        authorName: r.authorName || "",
        text: r.text,
        createdAt: toMillisValue(r.createdAt),
      }));
    } catch (err) {
      logError("group-topics.prisma_list_replies_failed", { error: err.message });
    }
  }
  return [];
}

export async function addThreadReply({ threadId, groupId, topicKey, uid, userName, text }) {
  const now = new Date();
  const prisma = getPrisma();
  if (prisma) {
    try {
      const threadRow = await prisma.topicThread.findUnique({ where: { id: threadId } });
      if (!threadRow) {
        return { error: "Thread not found" };
      }
      const reply = await prisma.topicReply.create({
        data: {
          threadId,
          groupId,
          topicKey: topicKey || null,
          authorId: uid,
          authorName: userName || "Member",
          text,
          createdAt: now,
        },
      });
      const replyCount = (threadRow.replyCount || 0) + 1;
      await prisma.topicThread.update({
        where: { id: threadId },
        data: { replyCount, lastActivityAt: now },
      });
      await prisma.groupTopic.update({
        where: { groupId_key: { groupId, key: topicKey } },
        data: { lastActivityAt: now },
      }).catch(() => {});
      if (threadRow.authorId && threadRow.authorId !== uid) {
        const groupRow = await prisma.group.findUnique({ where: { id: groupId } });
        const slug = groupRow ? groupRow.slug : "";
        const { createNotification } = await import("@/lib/server/notifications");
        await createNotification({
          userId: threadRow.authorId,
          type: "comment",
          actorId: uid,
          actorName: userName || "Member",
          targetId: threadId,
          href: `/groups/${slug}`,
          text: `Replied on "${threadRow.title || "your thread"}"`,
        });
      }
      return { id: reply.id };
    } catch (err) {
      logError("group-topics.prisma_add_reply_failed", { error: err.message });
    }
  }
  return { id: "" };
}
