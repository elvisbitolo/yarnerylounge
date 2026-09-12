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
