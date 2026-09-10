import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { blockedMemberIdsFor } from "@/lib/server/member-safety";

export const ROOM_MESSAGE_MAX = 2000;
export const ROOM_QUICK_EMOJIS = [
  "\u{1F44D}",
  "\u2764\uFE0F",
  "\u{1F602}",
  "\u{1F62E}",
  "\u{1F64F}",
  "\u{1F525}",
  "\u{1F389}",
  "\u{1F44F}",
  "\u{1F4AF}",
  "\u{1F9F6}",
  "\u2B50",
];

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

function removeUndefined(obj) {
  if (obj == null || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export async function getRoomForChat(roomId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.room.findUnique({ where: { id: roomId } })
        || await prisma.room.findUnique({ where: { slug: roomId } });
      if (row && (row.status || "active") === "active") {
        return { id: row.id, ...row };
      }
      if (row) return null;
    } catch (err) {
      logError("room-messages.prisma_room_failed", { error: err.message });
    }
  }
  return null;
}

async function resolveRoomId(roomKey) {
  const room = await getRoomForChat(roomKey);
  return room?.id || null;
}

function decodeMessage(raw) {
  const data = raw.data ? raw.data() : raw;
  const reactions = {};
  for (const [emoji, byUids] of Object.entries(data.reactions || {})) {
    reactions[emoji] = Object.keys(byUids || {});
  }
  const replyTo = data.replyTo || null;
  const msg = {
    id: raw.id,
    userId: data.userId || data.senderId || "",
    userName: data.userName || "Member",
    userAvatar: data.userAvatar || "",
    role: data.role || "viewer",
    imageData: data.deleted ? "" : data.imageData || "",
    text: data.deleted ? "" : data.text || "",
    mentions: data.mentions || [],
    replyTo: replyTo
      ? {
          id: replyTo.id || "",
          text: replyTo.text || "",
          from: replyTo.from || "",
        }
      : null,
    reactions,
    pinned: !!data.pinned,
    pinnedAt: toMillis(data.pinnedAt),
    deleted: !!data.deleted,
    deletedAt: toMillis(data.deletedAt),
    createdAt: toMillis(data.createdAt) || Date.now(),
  };
  return msg;
}

async function filterBlockedMessages(messages, viewerId) {
  if (!viewerId || messages.length === 0) return messages;
  const blocked = await blockedMemberIdsFor(viewerId, messages.map((message) => message.userId));
  return messages.filter((message) => !blocked.has(message.userId));
}

export async function listRoomMessages(roomId, { before, after, limit = 50, viewerId = "" } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const prisma = getPrisma();
  if (prisma) {
    try {
      const storageRoomId = await resolveRoomId(roomId);
      if (!storageRoomId) return { messages: [], hasMore: false };
      if (after) {
        const afterTs = Number.isFinite(after) ? after : toMillis(after);
        if (!afterTs) return { messages: [], hasMore: false };
        const rows = await prisma.roomMessage.findMany({
          where: { roomId: storageRoomId, createdAt: { gte: new Date(afterTs) } },
          orderBy: { createdAt: "asc" },
          take: safeLimit,
        });
        if (rows.length) {
          const list = await filterBlockedMessages(rows.map(decodeMessage).sort((a, b) => a.createdAt - b.createdAt), viewerId);
          return { messages: list, hasMore: rows.length >= safeLimit };
        }
      } else {
        const where = { roomId: storageRoomId };
        if (before) {
          const beforeTs = Number.isFinite(before) ? before : toMillis(before);
          if (beforeTs) where.createdAt = { lt: new Date(beforeTs) };
        }
        const rows = await prisma.roomMessage.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: safeLimit + 1,
        });
        if (rows.length) {
          const hasMore = rows.length > safeLimit;
          const list = await filterBlockedMessages(rows
            .slice(0, safeLimit)
            .map(decodeMessage)
            .sort((a, b) => a.createdAt - b.createdAt), viewerId);
          return { messages: list, hasMore };
        }
      }
    } catch (err) {
      logError("room-messages.prisma_list_failed", { error: err.message });
    }
  }
  return { messages: [], hasMore: false };
}

export async function addRoomMessage(roomId, sender, { text, mentions = [], replyTo = null, imageData = "" }) {
  const room = await getRoomForChat(roomId);
  if (!room) return null;
  const storageRoomId = room.id;
  const clean = String(text || "").trim();
  const cleanImage = String(imageData || "").trim();
  if ((!clean && !cleanImage) || clean.length > ROOM_MESSAGE_MAX) return null;
  const uniqueMentions = Array.isArray(mentions)
    ? [...new Set(mentions.filter((m) => typeof m === "string" && m))]
    : [];
  const payload = {
    roomId: storageRoomId,
    userId: sender.uid,
    userName: sender.name,
    userAvatar: sender.avatar || "",
    role: sender.role || "viewer",
    text: clean,
    imageData: cleanImage || "",
    mentions: uniqueMentions,
    replyTo: replyTo ? { id: replyTo.id || "", text: replyTo.text || "", from: replyTo.from || "" } : null,
    reactions: {},
    createdAt: new Date(),
  };
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.roomMessage.create({ data: payload });
      return created.id;
    } catch (err) {
      logError("room-messages.prisma_create_failed", { error: err.message });
    }
  }
  return null;
}

export async function toggleRoomReaction(roomId, messageId, uid, emoji) {
  if (!ROOM_QUICK_EMOJIS.includes(emoji)) {
    return { error: "Invalid emoji" };
  }
  const prisma = getPrisma();
  if (prisma) {
    try {
      const storageRoomId = await resolveRoomId(roomId);
      const row = await prisma.roomMessage.findUnique({ where: { id: messageId } });
      if (!row) return { error: "Message not found" };
      if (storageRoomId && row.roomId !== storageRoomId) return { error: "Message not found" };
      const reactions = row.reactions && typeof row.reactions === "object" ? { ...row.reactions } : {};
      const emojiReactions = reactions[emoji] && typeof reactions[emoji] === "object" ? { ...reactions[emoji] } : {};
      const alreadyReacted = !!emojiReactions[uid];
      if (alreadyReacted) {
        delete emojiReactions[uid];
      } else {
        emojiReactions[uid] = true;
      }
      if (Object.keys(emojiReactions).length > 0) {
        reactions[emoji] = emojiReactions;
      } else {
        delete reactions[emoji];
      }
      await prisma.roomMessage.update({
        where: { id: messageId },
        data: { reactions: removeUndefined(reactions) },
      });
      const decoded = {};
      for (const [e, byUids] of Object.entries(reactions)) {
        decoded[e] = Object.keys(byUids || {});
      }
      return { reactions: decoded };
    } catch (err) {
      logError("room-messages.prisma_reaction_failed", { error: err.message });
    }
  }
  return { error: "Database unavailable" };
}

export async function toggleRoomPin(roomId, messageId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const storageRoomId = await resolveRoomId(roomId);
      const row = await prisma.roomMessage.findUnique({ where: { id: messageId } });
      if (!row) return { error: "Message not found" };
      if (storageRoomId && row.roomId !== storageRoomId) return { error: "Message not found" };
      const isPinned = !!row.pinned;
      await prisma.roomMessage.update({
        where: { id: messageId },
        data: isPinned
          ? { pinned: false, pinnedAt: null }
          : { pinned: true, pinnedAt: new Date() },
      });
      return { pinned: !isPinned };
    } catch (err) {
      logError("room-messages.prisma_pin_failed", { error: err.message });
    }
  }
  return { error: "Database unavailable" };
}

export async function softDeleteRoomMessage(roomId, messageId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const storageRoomId = await resolveRoomId(roomId);
      const row = await prisma.roomMessage.findUnique({ where: { id: messageId } });
      if (!row) return { error: "Message not found" };
      if (storageRoomId && row.roomId !== storageRoomId) return { error: "Message not found" };
      if (row.deleted) return { deleted: true };
      await prisma.roomMessage.update({
        where: { id: messageId },
        data: { deleted: true, deletedAt: new Date(), text: "" },
      });
      return { deleted: true };
    } catch (err) {
      logError("room-messages.prisma_delete_failed", { error: err.message });
    }
  }
  return { error: "Database unavailable" };
}

export async function listPinnedRoomMessages(roomId, limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);
  const prisma = getPrisma();
  if (prisma) {
    try {
      const storageRoomId = await resolveRoomId(roomId);
      if (!storageRoomId) return [];
      const rows = await prisma.roomMessage.findMany({
        where: { roomId: storageRoomId, pinned: true },
        orderBy: { pinnedAt: "desc" },
        take: safeLimit,
      });
      return rows.map(decodeMessage);
    } catch (err) {
      logError("room-messages.prisma_pinned_failed", { error: err.message });
    }
  }
  return [];
}
