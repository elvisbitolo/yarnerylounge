export const POST_TEXT_MAX = 5000;
export const COMMENT_TEXT_MAX = 2000;
export const IMAGE_URL_MAX = 2048;
export const IMAGE_DATA_URL_MAX = 700_000;

// Soft-deleted posts sit in trash for 30 days (Facebook's window) before the
// feed purge hard-deletes them. Anything longer and a mistaken delete becomes
// an unrecoverable surprise; anything shorter and "restore" is a lie.
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Scheduling bounds. A post queued further out than a year is almost always a
// mistyped date, and the row would sit invisible in the feed query forever.
export const SCHEDULE_MAX_MS = 365 * 24 * 60 * 60 * 1000;


export function millis(v) {
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
    videoUrl: row.videoUrl || "",
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
    // Lifecycle fields. editedAt drives the "Edited" marker (and a version
    // snapshot exists whenever it is set); the rest let the client decide which
    // of the post menus to render.
    editedAt: millis(row.editedAt),
    deletedAt: millis(row.deletedAt),
    archivedAt: millis(row.archivedAt),
    hidden: !!row.hidden,
    hiddenReason: row.hiddenReason || "",
    lockedComments: !!row.lockedComments,
    sensitive: !!row.sensitive,
    altText: row.altText || "",
    scheduledAt: millis(row.scheduledAt),
    repostOfId: row.repostOfId || "",
    quoteOfId: row.quoteOfId || "",
  };
}

// Base `where` fragment for "the post is still live": not in trash, not
// waiting for its scheduled publish time. Every public read path must apply it
// or trashed/scheduled rows leak back into feeds, galleries and search.
export function livePostWhere(now = new Date()) {
  return {
    deletedAt: null,
    archivedAt: null,
    OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
  };
}

// Feed-shaped `where`: live-post filter + keyset cursor + hashtag, combined
// under AND because each piece carries its own OR and a shallow merge would
// silently drop one of them. The author keeps seeing their own not-yet-due
// scheduled posts, marked "Scheduled" in their own feed.
export function feedWhere({ cursor, tag, uid, now = new Date() } = {}) {
  const and = [{ OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] }];
  const after = cursorAfter(cursor);
  if (after) and.push(after);
  if (tag) and.push({ hashtags: { has: tag } });
  if (uid) and.push({ OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }, { authorId: uid }] });
  const where = { deletedAt: null, archivedAt: null, AND: and };
  return where;
}

// True when a scheduled post's publish time has arrived.
export function isDue(post, now = Date.now()) {
  return !!post?.scheduledAt && millis(post.scheduledAt) <= now;
}

// Edit authorization. Text is editable forever (Facebook/LinkedIn rules) by
// the author or a moderator; media, polls and the post kind are locked the
// moment it is published, exactly like LinkedIn, Instagram and Facebook.
export function editPostCheck(post, ctx) {
  if (!post) return { ok: false, status: 404, error: "Post not found" };
  if (post.deletedAt) return { ok: false, status: 404, error: "Post not found" };
  if (isSystemPost(post)) {
    return { ok: false, status: 403, error: "This announcement is read-only" };
  }
  const canModerate = !!(ctx.isOwner || ctx.isModerator);
  if (post.authorId !== ctx.uid && !canModerate) {
    return { ok: false, status: 403, error: "You can only edit your own posts" };
  }
  if (post.kind === "poll") {
    return { ok: false, status: 400, error: "Poll options are locked after publishing" };
  }
  return { ok: true };
}

// Which fields the client may send on PATCH. Anything not in this list is a
// post-publish mutation the big platforms do not allow either.
export const EDITABLE_POST_FIELDS = ["text", "altText", "sensitive", "removeMedia"];


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

export function isValidVideoUrl(value) {
  if (value == null || value === "") return true;
  if (typeof value !== "string") return false;
  if (value.length > IMAGE_URL_MAX) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

export function validateMediaPair(imageUrl, videoUrl) {
  const img = isValidImageUrl(imageUrl);
  if (!img) return { ok: false, error: "Invalid image URL" };
  const vid = isValidVideoUrl(videoUrl);
  if (!vid) return { ok: false, error: "Invalid video URL" };
  if (imageUrl && videoUrl) {
    return { ok: false, error: "A post can have an image or a video, not both" };
  }
  return { ok: true };
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

// The pinned read-only announcement (the Terms of Service) has no member
// author, so Post.authorId is nullable and the author is null. The "system"
// string is still accepted so a row created before this change keeps rendering
// as read-only.
//
// The kind check is load-bearing, not decoration: it is the only thing
// separating "authored by the community" from "owned by the platform". Without
// it, a post whose author was deleted would be treated as a system post and
// become impossible to delete, impossible to comment on, and impossible to
// report.
//
// The author comparison is deliberately strict. An authorId that is absent
// (undefined, because a projection omitted it) is not the same as an authorId
// that is null, and only the latter means "this post is owned by the platform".
// Anything unknown is treated as an ordinary post, which keeps the moderation
// controls available rather than silently removing them.
export function isSystemPost(post) {
  if (!post) return false;
  if (post.kind !== "announcement") return false;
  return post.authorId === null || post.authorId === "system";
}

