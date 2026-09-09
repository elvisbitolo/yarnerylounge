import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { createNotification } from "./notifications";

const MENTION_REGEX = /@([a-zA-Z0-9_]{1,30})/g;

export function extractMentions(text) {
  if (typeof text !== "string") return [];
  const mentions = [];
  const seen = new Set();
  let match;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const username = match[1].toLowerCase();
    if (!seen.has(username)) {
      seen.add(username);
      mentions.push(username);
    }
  }
  return mentions;
}

export async function resolveMentions(usernames) {
  if (!usernames.length) return [];
  const prisma = getPrisma();
  const results = [];
  for (const username of usernames) {
    if (prisma) {
      try {
        const row = await prisma.user.findFirst({ where: { username } });
        if (row) {
          results.push({ uid: row.id, username, name: row.name || username });
          continue;
        }
      } catch (err) {
        logError("mentions.prisma_resolve_failed", { error: err.message });
      }
    }
  }
  return results;
}

export async function sendMentionNotifications({
  mentions,
  actorId,
  actorName,
  targetId,
  href,
  text,
  excludeSelf = true,
}) {
  for (const mention of mentions) {
    if (excludeSelf && mention.uid === actorId) continue;
    await createNotification({
      userId: mention.uid,
      type: "mention",
      actorId,
      actorName,
      targetId,
      href,
      text: `mentioned you in a ${text || "post"}`,
    }).catch(() => {});
  }
}

export async function searchMembersForMention(query, limit = 8) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.user.findMany({
        take: 100,
        select: { id: true, name: true, username: true, photoURL: true },
      });
      const matches = [];
      for (const row of rows) {
        const name = (row.name || "").toLowerCase();
        const username = (row.username || "").toLowerCase();
        if (name.includes(q) || username.includes(q)) {
          matches.push({
            uid: row.id,
            name: row.name || "",
            username: row.username || "",
            photoURL: row.photoURL || "",
          });
          if (matches.length >= limit) break;
        }
      }
      matches.sort((a, b) => {
        const aExact = a.username === q || a.name.toLowerCase() === q;
        const bExact = b.username === q || b.name.toLowerCase() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const aStarts = a.username.startsWith(q) || a.name.toLowerCase().startsWith(q);
        const bStarts = b.username.startsWith(q) || b.name.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });
      return matches;
    } catch (err) {
      logError("mentions.prisma_search_failed", { error: err.message });
    }
  }
  return [];
}
