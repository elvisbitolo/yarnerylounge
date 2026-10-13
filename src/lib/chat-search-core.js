// Pure helpers behind the chat rail's unified search.
//
// Two things make chat search different from community search:
//
//   1. Message text is encrypted at rest (AES-256-GCM with a random IV), so a
//      conversation's history cannot be matched with a SQL LIKE. It is
//      decrypted server-side and matched in memory, and these are the
//      in-memory halves of that scan.
//   2. The rail searches two different things at once — conversations (by
//      title and by message history) and members — so the shaping lives here,
//      kept away from Prisma and from React so it can be exercised directly.

// One-character queries match almost every message, so the rail waits for two.
export const CHAT_SEARCH_MIN_QUERY = 2;
export const CHAT_SEARCH_SNIPPET_RADIUS = 40;
export const CHAT_SEARCH_SNIPPETS_PER_CONVERSATION = 3;

export function normalizeQuery(value) {
  return String(value ?? "").trim().toLowerCase();
}

// Should the caller spend a round trip on this query? The rail still filters the
// list it already has for shorter input; this only gates the server scan.
export function hasSearchQuery(value) {
  return normalizeQuery(value).length >= CHAT_SEARCH_MIN_QUERY;
}

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

// A one-line window around the first hit, so a result explains *why* it matched
// rather than always showing the newest message. Falls back to the head of the
// text when the query is empty or absent.
export function buildSnippet(text, query, radius = CHAT_SEARCH_SNIPPET_RADIUS) {
  const source = String(text ?? "");
  if (!source) return "";
  const q = normalizeQuery(query);
  const head = source.length > radius * 2 ? `${source.slice(0, radius * 2).trimEnd()}…` : source;
  if (!q) return head;

  const at = source.toLowerCase().indexOf(q);
  if (at === -1) return head;

  const start = Math.max(0, at - radius);
  const end = Math.min(source.length, at + q.length + radius);
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

// Collapse decrypted messages into one summary per conversation: how many
// matched, when the newest match was, and a few snippets to show. The caller
// passes messages newest-first, so the snippets kept are the most recent ones.
export function summarizeMatches(messages, query, options = {}) {
  const {
    snippetRadius = CHAT_SEARCH_SNIPPET_RADIUS,
    snippetsPerConversation = CHAT_SEARCH_SNIPPETS_PER_CONVERSATION,
  } = options;
  const q = normalizeQuery(query);
  if (!q || !Array.isArray(messages)) return [];

  const byConversation = new Map();
  for (const message of messages) {
    const conversationId = message?.conversationId;
    const text = typeof message?.text === "string" ? message.text : "";
    if (!conversationId || !text) continue;
    if (!text.toLowerCase().includes(q)) continue;

    const at = toMillis(message.createdAt);
    let summary = byConversation.get(conversationId);
    if (!summary) {
      summary = { conversationId, matchCount: 0, lastMatchAt: 0, snippets: [] };
      byConversation.set(conversationId, summary);
    }
    summary.matchCount += 1;
    if (at > summary.lastMatchAt) summary.lastMatchAt = at;
    if (summary.snippets.length < snippetsPerConversation) {
      summary.snippets.push({
        id: message.id || "",
        text: buildSnippet(text, q, snippetRadius),
        senderId: message.senderId || "",
        createdAt: at,
      });
    }
  }

  return [...byConversation.values()].sort(
    (a, b) => b.lastMatchAt - a.lastMatchAt || b.matchCount - a.matchCount
  );
}
