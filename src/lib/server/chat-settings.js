import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  CHAT_SETTINGS_DEFAULTS,
  mergeChatSettings,
  mergeConversationPrefs,
  normalizeChatSettings,
  normalizeConversationPrefPatch,
  readChatPrefs,
} from "@/lib/chat-settings-core";

const extraOf = (row) => (row && row.extra && typeof row.extra === "object" ? row.extra : {});
const chatSettingsOf = (extra) =>
  extra.chatSettings && typeof extra.chatSettings === "object" ? extra.chatSettings : {};

export async function getChatSettings(uid) {
  const prisma = getPrisma();
  if (!prisma) return { ...CHAT_SETTINGS_DEFAULTS };
  try {
    const row = await prisma.user.findUnique({ where: { id: uid }, select: { extra: true } });
    return { ...CHAT_SETTINGS_DEFAULTS, ...chatSettingsOf(extraOf(row)) };
  } catch (err) {
    logError("chat-settings.read_failed", { error: err.message });
    return { ...CHAT_SETTINGS_DEFAULTS };
  }
}

export async function saveChatSettings(uid, patch) {
  const normalized = normalizeChatSettings(patch);
  if (!Object.keys(normalized).length) return null;
  const prisma = getPrisma();
  if (!prisma) return null;
  const row = await prisma.user.findUnique({ where: { id: uid }, select: { extra: true } });
  const extra = extraOf(row);
  const next = mergeChatSettings(chatSettingsOf(extra), normalized);
  await prisma.user.update({
    where: { id: uid },
    data: { extra: { ...extra, chatSettings: next } },
  });
  return next;
}

export async function getConversationPrefs(uid, conversationId) {
  const prisma = getPrisma();
  if (!prisma) return {};
  try {
    const row = await prisma.user.findUnique({ where: { id: uid }, select: { extra: true } });
    return readChatPrefs(extraOf(row), conversationId);
  } catch (err) {
    logError("chat-prefs.read_failed", { error: err.message });
    return {};
  }
}

export async function saveConversationPrefs(uid, conversationId, patch) {
  const normalized = normalizeConversationPrefPatch(patch);
  if (!Object.keys(normalized).length) return null;
  const prisma = getPrisma();
  if (!prisma) return null;
  const row = await prisma.user.findUnique({ where: { id: uid }, select: { extra: true } });
  const extra = extraOf(row);
  const chatPrefs = mergeConversationPrefs(extra, conversationId, normalized);
  await prisma.user.update({
    where: { id: uid },
    data: { extra: { ...extra, chatPrefs } },
  });
  return chatPrefs[conversationId];
}