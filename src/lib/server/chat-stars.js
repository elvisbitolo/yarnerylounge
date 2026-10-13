import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { decryptText } from "@/lib/server/crypto";
import { getConversation } from "@/lib/server/chat";
import { getChatSettings } from "@/lib/server/chat-settings";
import { readStarredMessages, toggleStarInExtra } from "@/lib/chat-star-core";

const extraOf = (row) => (row && row.extra && typeof row.extra === "object" ? row.extra : {});

// Starred messages are viewer-local, so the payload never includes the
// attachment data — just enough to recognize and re-open it.
function shapeStarred(row, starredAt) {
  const attachment = row.attachment && typeof row.attachment === "object" ? row.attachment : null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    senderName: row.senderName || "Member",
    text: typeof row.text === "string" ? decryptText(row.text) || "" : "",
    createdAt: row.createdAt ? new Date(row.createdAt).getTime() : 0,
    starredAt: Number(starredAt) || 0,
    hasAttachment: !!row.hasAttachment,
    attachment:
      attachment && attachment.name
        ? { kind: attachment.kind || "file", name: attachment.name }
        : null,
  };
}

export async function getStarredMessagesFor(uid, conversationId) {
  const prisma = getPrisma();
  if (!prisma) return [];
  try {
    const conv = await getConversation(conversationId, uid);
    if (!conv) return [];
    const row = await prisma.user.findUnique({ where: { id: uid }, select: { extra: true } });
    const starred = readStarredMessages(extraOf(row), conversationId);
    const ids = Object.keys(starred);
    if (!ids.length) return [];

    const rows = await prisma.conversationMessage.findMany({
      where: { id: { in: ids }, conversationId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        senderName: true,
        text: true,
        createdAt: true,
        hasAttachment: true,
        attachment: true,
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => {
        const msgRow = byId.get(id);
        if (!msgRow) return null;
        return shapeStarred(msgRow, starred[id]);
      })
      .filter(Boolean)
      .sort((a, b) => b.starredAt - a.starredAt);
  } catch (err) {
    logError("chat-stars.list_failed", { error: err.message });
    return [];
  }
}

export async function saveMessageStar(uid, conversationId, messageId, starred) {
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    const msg = await prisma.conversationMessage.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });
    if (!msg || msg.conversationId !== conversationId) return null;

    const row = await prisma.user.findUnique({ where: { id: uid }, select: { extra: true } });
    const extra = extraOf(row);
    const next = toggleStarInExtra(extra, conversationId, messageId, starred);
    await prisma.user.update({ where: { id: uid }, data: { extra: next } });
    return starred;
  } catch (err) {
    logError("chat-stars.save_failed", { error: err.message });
    return null;
  }
}

export async function getMessageInfo(uid, conversationId, messageId) {
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    const conv = await getConversation(conversationId, uid);
    if (!conv) return null;
    const msg = await prisma.conversationMessage.findUnique({ where: { id: messageId } });
    if (!msg || msg.conversationId !== conversationId) return null;

    const info = {
      sentAt: msg.createdAt ? new Date(msg.createdAt).getTime() : 0,
      senderId: msg.senderId,
      mine: msg.senderId === uid,
    };

    // Read receipts are only ever shown to the sender of a message — and only
    // when the viewer hasn't switched receipts off for themselves.
    if (!info.mine) return { ...info, readers: [] };
    const settings = await getChatSettings(uid);
    if (settings.readReceipts === false) return { ...info, readers: [] };

    const raw = msg.readBy && typeof msg.readBy === "object" ? msg.readBy : {};
    const readerIds = Object.keys(raw).filter((readerId) => readerId !== uid);
    if (!readerIds.length) return { ...info, readers: [] };

    const profiles = await prisma.user.findMany({
      where: { id: { in: readerIds } },
      select: { id: true, name: true },
    });
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const readers = readerIds.map((readerId) => ({
      uid: readerId,
      name: byId.get(readerId)?.name || "Member",
      readAt: Number(raw[readerId]) || 0,
    }));
    return { ...info, readers };
  } catch (err) {
    logError("chat-stars.info_failed", { error: err.message });
    return null;
  }
}