export const POST_TEXT_MAX = 5000;
export const COMMENT_TEXT_MAX = 2000;
export const IMAGE_URL_MAX = 2048;
export const IMAGE_DATA_URL_MAX = 700_000;

function millis(v) {
  if (v == null) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Maps a Prisma Post row to the serialized post shape API consumers expect
// (timestamps as epoch millis).
export function mapPostRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.authorName || "",
    authorRole: row.authorRole || "",
    text: row.text,
    kind: row.kind || "post",
    imageUrl: row.imageUrl || "",
    likes: row.likes || {},
    bookmarks: row.bookmarks || {},
    reactions: row.reactions || {},
    pinned: !!row.pinned,
    pinnedAt: millis(row.pinnedAt),
    hashtags: row.hashtags || [],
    commentCount: row.commentCount || 0,
    lastActivityAt: millis(row.lastActivityAt),
    createdAt: millis(row.createdAt),
    spaceId: row.spaceId || "",
    groupId: row.groupId || "",
    pollOptions: row.pollOptions || [],
    pollCounts: row.pollCounts || {},
    pollTotal: row.pollTotal || 0,
    pollDeadline: millis(row.pollDeadline),
    pollStatus: row.pollStatus || "",
  };
}

export function validatePostText(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "Post text required" };
  }
  if (text.trim().length > POST_TEXT_MAX) {
    return { ok: false, error: `Post text too long (max ${POST_TEXT_MAX} characters)` };
  }
  return { ok: true, text: text.trim() };
}

export function validateCommentText(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "Comment text required" };
  }
  if (text.trim().length > COMMENT_TEXT_MAX) {
    return { ok: false, error: `Comment too long (max ${COMMENT_TEXT_MAX} characters)` };
  }
  return { ok: true, text: text.trim() };
}

export function isValidImageUrl(value) {
  if (value == null || value === "") return true;
  if (typeof value !== "string") return false;
  if (value.startsWith("data:image/")) {
    return value.length <= IMAGE_DATA_URL_MAX;
  }
  if (value.length > IMAGE_URL_MAX) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

export function postAccessCheck(post, ctx) {
  if (ctx.isOwner || post.authorId === ctx.uid) {
    return { ok: true, post };
  }
  if (!ctx.isActiveSub) {
    return { ok: false, status: 403, error: "Active membership required" };
  }
  if (post.spaceId && !ctx.isSpaceMember) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (post.groupId && !ctx.isGroupMember) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, post };
}

export function nextLikeState(likes, uid) {
  const current = likes || {};
  const already = Object.prototype.hasOwnProperty.call(current, uid);
  const count = Object.keys(current).length + (already ? -1 : 1);
  return { already, liked: !already, count };
}

// Ordering shared by the feed route. pinned stays on top, then newest first,
// with id as the deterministic tiebreaker so cursor pagination is stable.
export function feedOrderBy() {
  return [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }];
}

// Compound keyset cursor. Because the feed orders by (pinned, createdAt, id),
// the cursor must carry all three — an id-only cursor silently skips rows any
// time a pinned post (or a same-timestamp post) is present.
export function encodeCursor(key) {
  if (!key || typeof key !== "object" || (!key.id && typeof key.o !== "number")) return "";
  if (typeof key.o === "number") {
    return Buffer.from(JSON.stringify({ o: key.o })).toString("base64url");
  }
  const payload = JSON.stringify({
    p: key.pinned ? 1 : 0,
    c: millis(key.createdAt),
    i: key.id,
  });
  return Buffer.from(payload).toString("base64url");
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (parsed && typeof parsed.o === "number") return { o: parsed.o };
    if (!parsed || typeof parsed.i !== "string" || !parsed.i) return null;
    return { pinned: parsed.p === 1, createdAt: parsed.c || 0, id: parsed.i };
  } catch {
    return null;
  }
}

// Prisma `where` that selects every row strictly after `key` in the feed order
// (pinned desc, createdAt desc, id desc) — the keyset equivalent of
// `WHERE (sortKeys) AFTER (:key)`.
export function cursorAfter(key) {
  if (!key || !key.id) return undefined;
  const samePinned = [
    { createdAt: { lt: new Date(key.createdAt) } },
    { createdAt: new Date(key.createdAt), id: { lt: key.id } },
  ];
  return {
    OR: [
      ...(key.pinned ? [{ pinned: false }] : []),
      { pinned: key.pinned, OR: samePinned },
    ],
  };
}

export function paginatePostRows(rows, limit) {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    posts: page.map(mapPostRow),
    nextCursor: hasMore ? encodeCursor(last) : null,
    hasMore,
  };
}
