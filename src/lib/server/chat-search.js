import { getPrisma } from "@/lib/db/prisma";
import { decryptText } from "@/lib/server/crypto";
import { blockedMemberIdsFor } from "@/lib/server/member-safety";
import { rankResults } from "@/lib/server/search-engine";
import { logError } from "@/lib/server/log";
import { normalizeQuery, summarizeMatches } from "@/lib/chat-search-core";
import { withNotSuspended } from "@/lib/server/member-visibility-core";

// The decrypt budget for a single search.
//
// Message text is AES-256-GCM with a random IV, so history cannot be matched
// with a SQL LIKE — every candidate row has to be decrypted in memory. This cap
// bounds that work; rows are read newest-first, so a capped scan still covers
// the messages a reader is most likely to be looking for.
export const CHAT_HISTORY_SCAN_LIMIT = 5000;
export const CHAT_SEARCH_MAX_CONVERSATIONS = 25;
export const CHAT_MEMBER_LIMIT = 8;

// Which of the member's conversations mention `query`, with snippets.
//
// Only the searcher's own conversations are scanned, so this never reaches
// another member's history.
export async function searchChatHistory(uid, query) {
  const q = normalizeQuery(query);
  if (!uid || q.length < 2) return [];
  const prisma = getPrisma();
  if (!prisma) return [];

  try {
    const conversations = await prisma.conversation.findMany({
      where: { participantIds: { has: uid } },
      select: { id: true },
    });
    const ids = conversations.map((c) => c.id);
    if (!ids.length) return [];

    const rows = await prisma.conversationMessage.findMany({
      where: { conversationId: { in: ids } },
      select: { id: true, conversationId: true, senderId: true, text: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: CHAT_HISTORY_SCAN_LIMIT,
    });

    const decrypted = rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      text: decryptText(row.text) || "",
      createdAt: row.createdAt,
    }));

    return summarizeMatches(decrypted, q).slice(0, CHAT_SEARCH_MAX_CONVERSATIONS);
  } catch (err) {
    logError("chat.search_history_failed", { error: err.message, uid });
    return [];
  }
}

// Search every member by name or username, so the rail can start a chat with
// anyone. Matches are ranked (exact → prefix → substring) and both directions
// of a block are removed, so a blocked member never surfaces as a suggestion.
export async function searchMembersForChat(uid, query, limit = CHAT_MEMBER_LIMIT) {
  const q = normalizeQuery(query);
  if (!uid || q.length < 1) return [];
  const prisma = getPrisma();
  if (!prisma) return [];

  try {
    const rows = await prisma.user.findMany({
      where: withNotSuspended({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
        ],
      }),
      select: { id: true, name: true, username: true, photoURL: true },
      take: limit * 4,
    });

    const candidates = rows.filter((row) => row.id !== uid);
    if (!candidates.length) return [];

    const blocked = await blockedMemberIdsFor(uid, candidates.map((row) => row.id));
    const visible = candidates.filter((row) => !blocked.has(row.id));

    return rankResults(q, visible, (row) => [row.name, row.username])
      .slice(0, limit)
      .map((row) => ({
        uid: row.id,
        name: row.name || "",
        username: row.username || "",
        photoURL: row.photoURL || "",
      }));
  } catch (err) {
    logError("chat.search_members_failed", { error: err.message, uid });
    return [];
  }
}
