import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { encryptText, decryptText } from "@/lib/server/crypto";

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

function mapConversationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    participantIds: row.participantIds || [],
    name: row.name || "",
    groupId: row.groupId || "",
    spaceId: row.spaceId || "",
    createdBy: row.createdBy,
    createdAt: toMillisValue(row.createdAt) || null,
    updatedAt: toMillisValue(row.updatedAt) || null,
    lastMessage: row.lastMessageEnc ? decryptText(row.lastMessage) : row.lastMessage || "",
    lastMessageEnc: !!row.lastMessageEnc,
    lastMessageAt: toMillisValue(row.lastMessageAt) || null,
    lastReadAt: row.lastReadAt || null,
  };
}

export async function getOrCreateDm(uid, otherId) {
  if (!otherId) return null;
  const ids = [uid, otherId].sort();

  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.conversation.findFirst({
        where: { type: "dm", participantIds: { equals: ids } },
      });
      if (row) return mapConversationRow(row);
      const created = await prisma.conversation.create({
        data: {
          type: "dm",
          participantIds: ids,
          name: "",
          groupId: "",
          createdBy: uid,
          lastMessage: "",
          lastMessageAt: null,
        },
      });
      return { id: created.id, type: "dm", participantIds: ids };
    } catch (err) {
      logError("chat.prisma_dm_find_failed", { error: err.message });
    }
  }
  return null;
}

export async function getOrCreateGroupChat(uid, groupId) {
  if (!groupId) return null;

  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.conversation.findFirst({
        where: { type: "group", groupId },
      });
      if (row) {
        const pids = row.participantIds || [];
        if (!pids.includes(uid)) {
          const next = [...new Set([...pids, uid])];
          await prisma.conversation.update({
            where: { id: row.id },
            data: { participantIds: next, updatedAt: new Date() },
          });
          return { ...mapConversationRow(row), participantIds: next };
        }
        return mapConversationRow(row);
      }
      const groupRow = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true },
      });
      if (!groupRow) return null;
      const groupMembers = await prisma.groupMember.findMany({
        where: { groupId },
        select: { userId: true },
      });
      const participantIds = [...new Set([uid, ...groupMembers.map((m) => m.userId)])];
      const created = await prisma.conversation.create({
        data: {
          type: "group",
          participantIds,
          name: groupRow.name,
          groupId,
          createdBy: uid,
          lastMessage: "",
          lastMessageAt: null,
        },
      });
      return { id: created.id, type: "group", name: groupRow.name, groupId };
    } catch (err) {
      logError("chat.prisma_group_chat_failed", { error: err.message });
    }
  }
  return null;
}

export async function syncGroupChatParticipants(groupId, participantIds) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.conversation.findFirst({
        where: { type: "group", groupId },
      });
      if (row) {
        const next = [...new Set(participantIds)];
        if (JSON.stringify(row.participantIds) !== JSON.stringify(next)) {
          await prisma.conversation.update({
            where: { id: row.id },
            data: { participantIds: next, updatedAt: new Date() },
          });
        }
        return;
      }
    } catch (err) {
      logError("chat.prisma_sync_group_failed", { error: err.message });
    }
  }
}

export async function getOrCreateSpaceChat(uid, spaceId) {
  if (!spaceId) return null;

  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.conversation.findFirst({
        where: { type: "space", spaceId },
      });
      if (row) {
        const pids = row.participantIds || [];
        if (!pids.includes(uid)) {
          const next = [...new Set([...pids, uid])];
          await prisma.conversation.update({
            where: { id: row.id },
            data: { participantIds: next, updatedAt: new Date() },
          });
          return { ...mapConversationRow(row), participantIds: next };
        }
        return mapConversationRow(row);
      }
      const spaceRow = await prisma.space.findUnique({
        where: { id: spaceId },
        select: { name: true },
      });
      if (!spaceRow) return null;
      const spaceMembers = await prisma.spaceMember.findMany({
        where: { spaceId },
        select: { userId: true },
      });
      const participantIds = [...new Set([uid, ...spaceMembers.map((m) => m.userId)])];
      const created = await prisma.conversation.create({
        data: {
          type: "space",
          participantIds,
          name: spaceRow.name,
          spaceId,
          createdBy: uid,
          lastMessage: "",
          lastMessageAt: null,
        },
      });
      return { id: created.id, type: "space", name: spaceRow.name, spaceId };
    } catch (err) {
      logError("chat.prisma_space_chat_failed", { error: err.message });
    }
  }
  return null;
}

export async function syncSpaceChatParticipants(spaceId, participantIds) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.conversation.findFirst({
        where: { type: "space", spaceId },
      });
      if (row) {
        const next = [...new Set(participantIds)];
        if (JSON.stringify(row.participantIds) !== JSON.stringify(next)) {
          await prisma.conversation.update({
            where: { id: row.id },
            data: { participantIds: next, updatedAt: new Date() },
          });
        }
        return;
      }
    } catch (err) {
      logError("chat.prisma_sync_space_failed", { error: err.message });
    }
  }
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))].slice(0, 100);
}

async function loadNames(ids) {
  const names = {};
  if (ids.length === 0) return names;

  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.user.findMany({ where: { id: { in: ids } } });
      for (const row of rows) {
        names[row.id] = row.name || "Member";
      }
      return names;
    } catch (err) {
      logError("chat.prisma_load_names_failed", { error: err.message });
    }
  }
  return names;
}

export async function listConversations(uid) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.conversation.findMany({
        where: { participantIds: { has: uid } },
      });
      if (rows.length) {
        const ids = uniqueIds(
          rows.flatMap((r) => (r.participantIds || []).filter((id) => id !== uid))
        );
        const names = await loadNames(ids);
        return rows
          .map((row) => {
            const data = mapConversationRow(row);
            const title =
              data.type === "dm"
                ? (data.participantIds.filter((id) => id !== uid)[0] || "Chat")
                : data.name || "Group chat";
            return {
              id: data.id,
              type: data.type,
              title: names[title] || title,
              groupId: data.groupId || "",
              lastMessage: data.lastMessageEnc ? decryptText(data.lastMessage) : data.lastMessage || "",
              lastMessageAt: data.lastMessageAt || 0,
              updatedAt: toMillisValue(row.updatedAt) || 0,
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);
      }
    } catch (err) {
      logError("chat.prisma_list_convos_failed", { error: err.message });
    }
  }
  return [];
}

export async function getConversation(id, uid) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.conversation.findUnique({ where: { id } });
      if (row) {
        const pids = row.participantIds || [];
        if (!pids.includes(uid)) return null;
        const ids = uniqueIds(pids.filter((vid) => vid !== uid));
        const names = await loadNames(ids);
        return {
          ...mapConversationRow(row),
          participantIds: pids,
          title:
            row.type === "dm"
              ? names[pids.filter((v) => v !== uid)[0]] || "Chat"
              : row.name || "Group chat",
          createdAt: toMillisValue(row.createdAt),
        };
      }
    } catch (err) {
      logError("chat.prisma_get_conv_failed", { error: err.message });
    }
  }
  return null;
}

export async function listMessages(conversationId, limitCount = 200) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.conversationMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: limitCount,
      });
      if (rows.length) {
        return rows
          .map((row) => {
            const rawReadBy = row.readBy && typeof row.readBy === "object" ? row.readBy : {};
            const readBy = {};
            for (const [k, v] of Object.entries(rawReadBy)) {
              readBy[k] = toMillisValue(v) ?? (Number(v) || 0);
            }
            const msg = {
              id: row.id,
              conversationId: row.conversationId,
              senderId: row.senderId,
              senderName: row.senderName || "",
              text: decryptText(row.text),
              createdAt: toMillisValue(row.createdAt) || 0,
              readBy,
              parentId: row.parentId || null,
              replyCount: row.replyCount || 0,
              hasAttachment: !!row.hasAttachment,
            };
            if (row.attachment && typeof row.attachment === "object") {
              msg.attachment = {
                ...row.attachment,
                dataUrl: typeof row.attachment.dataUrl === "string" ? decryptText(row.attachment.dataUrl) : row.attachment.dataUrl,
              };
            }
            return msg;
          })
          .reverse();
      }
    } catch (err) {
      logError("chat.prisma_list_msgs_failed", { error: err.message });
    }
  }
  return [];
}

export async function addMessage(conversationId, sender, text, attachment = null, parentId = null) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conv) return null;
      const pids = conv.participantIds || [];
      if (!pids.includes(sender.uid)) return null;

      const now = new Date();
      const msgData = {
        conversationId,
        senderId: sender.uid,
        senderName: sender.name || "",
        text: encryptText(text),
        createdAt: now,
        readBy: {},
        parentId: parentId || null,
        replyCount: 0,
        hasAttachment: false,
      };
      if (attachment) {
        msgData.attachment = {
          name: String(attachment.name || "").slice(0, 120),
          mime: String(attachment.mime || "").slice(0, 100),
          kind: attachment.kind === "image" ? "image" : "file",
          size: Number.isFinite(attachment.size) && attachment.size > 0 ? Math.round(attachment.size) : 0,
          dataUrl: encryptText(attachment.dataUrl),
        };
        msgData.hasAttachment = true;
      }
      const created = await prisma.conversationMessage.create({ data: msgData });

      const preview =
        text ||
        (attachment?.kind === "image"
          ? "Photo"
          : attachment?.name
            ? `${attachment.name}`
            : "");
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessage: encryptText(preview),
          lastMessageEnc: true,
          lastMessageAt: now,
          updatedAt: now,
        },
      });
      return created.id;
    } catch (err) {
      logError("chat.prisma_add_msg_failed", { error: err.message });
    }
  }
  return null;
}

export async function markConversationRead(conversationId, uid) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conv) return false;
      const pids = conv.participantIds || [];
      if (!pids.includes(uid)) return false;

      const now = new Date();
      const currentReadAt = conv.lastReadAt && typeof conv.lastReadAt === "object" ? conv.lastReadAt : {};
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastReadAt: { ...currentReadAt, [uid]: now } },
      });

      const msgs = await prisma.conversationMessage.findMany({
        where: { conversationId, senderId: { not: uid } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      const updates = [];
      for (const msg of msgs) {
        const rawReadBy = msg.readBy && typeof msg.readBy === "object" ? msg.readBy : {};
        if (!rawReadBy[uid]) {
          updates.push(
            prisma.conversationMessage.update({
              where: { id: msg.id },
              data: { readBy: { ...rawReadBy, [uid]: now } },
            })
          );
        }
      }
      if (updates.length) await Promise.all(updates);
      return true;
    } catch (err) {
      logError("chat.prisma_mark_read_failed", { error: err.message });
    }
  }
  return false;
}

export async function unreadCount(uid) {
  const convs = await listConversations(uid);
  let count = 0;

  const prisma = getPrisma();
  if (prisma) {
    try {
      for (const conv of convs) {
        const row = await prisma.conversation.findUnique({
          where: { id: conv.id },
          select: { lastMessageAt: true, lastReadAt: true },
        });
        if (!row) continue;
        const lastRead = toMillisValue(row.lastReadAt?.[uid]);
        const lastMsgAt = toMillisValue(row.lastMessageAt);
        if (lastMsgAt > lastRead) count++;
      }
      return count;
    } catch (err) {
      logError("chat.prisma_unread_count_failed", { error: err.message });
    }
  }
  return count;
}

export function toMillis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  return new Date(value).getTime();
}
