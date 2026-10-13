import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { applyAppearancePatch, applyPerChatOverride, DEFAULT_APPEARANCE } from "@/lib/chat-appearance-core";

const extraOf = (row) => (row && row.extra && typeof row.extra === "object" ? row.extra : {});
const appearanceOf = (extra) =>
  extra.appearance && typeof extra.appearance === "object" ? extra.appearance : {};

export async function getAppearance(uid) {
  const prisma = getPrisma();
  if (!prisma) return { ...DEFAULT_APPEARANCE };
  try {
    const row = await prisma.user.findUnique({ where: { id: uid }, select: { extra: true } });
    return {
      wallpaper: typeof appearanceOf(extraOf(row)).wallpaper === "string"
        ? appearanceOf(extraOf(row)).wallpaper
        : "default",
      customWallpaper: typeof appearanceOf(extraOf(row)).customWallpaper === "string"
        ? appearanceOf(extraOf(row)).customWallpaper
        : "",
      perChat: appearanceOf(extraOf(row)).perChat || {},
    };
  } catch (err) {
    logError("chat-appearance.read_failed", { error: err.message });
    return { ...DEFAULT_APPEARANCE };
  }
}

export async function saveAppearance(uid, patch, conversationId = "") {
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    const row = await prisma.user.findUnique({ where: { id: uid }, select: { extra: true } });
    const extra = extraOf(row);
    const current = appearanceOf(extra);
    const next = conversationId
      ? applyPerChatOverride(current, conversationId, patch?.wallpaper)
      : applyAppearancePatch(current, patch);
    await prisma.user.update({
      where: { id: uid },
      data: { extra: { ...extra, appearance: next } },
    });
    return next;
  } catch (err) {
    logError("chat-appearance.save_failed", { error: err.message });
    return null;
  }
}