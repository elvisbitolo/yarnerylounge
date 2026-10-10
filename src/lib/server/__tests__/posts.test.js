import { test } from "node:test";
import assert from "node:assert/strict";
import {
  postAccessCheck,
  isSystemPost,
  nextLikeState,
  validatePostText,
  validateCommentText,
  isValidImageUrl,
  POST_TEXT_MAX,
  encodeCursor,
  decodeCursor,
  feedOrderBy,
  paginatePostRows,
  mapPostRow,
  livePostWhere,
  feedWhere,
  editPostCheck,
  TRASH_RETENTION_MS,
  SCHEDULE_MAX_MS,
} from "../posts-core.js";

const post = { authorId: "u1", spaceId: "s1", groupId: "" };
const groupPost = { authorId: "u1", spaceId: "", groupId: "g1" };

test("postAccessCheck: author always passes", () => {
  const result = postAccessCheck(post, {
    uid: "u1",
    isOwner: false,
    isActiveSub: false,
    isSpaceMember: false,
  });
  assert.equal(result.ok, true);
});

test("postAccessCheck: owner always passes", () => {
  const result = postAccessCheck(post, {
    uid: "u9",
    isOwner: true,
    isActiveSub: false,
    isSpaceMember: false,
  });
  assert.equal(result.ok, true);
});

test("postAccessCheck: non-member without active sub is denied", () => {
  const result = postAccessCheck(post, {
    uid: "u2",
    isOwner: false,
    isActiveSub: false,
    isSpaceMember: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /membership/i);
});

test("postAccessCheck: non-space-member is denied", () => {
  const result = postAccessCheck(post, {
    uid: "u2",
    isOwner: false,
    isActiveSub: true,
    isSpaceMember: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("postAccessCheck: non-group-member is denied for group posts", () => {
  const result = postAccessCheck(groupPost, {
    uid: "u2",
    isOwner: false,
    isActiveSub: true,
    isSpaceMember: true,
    isGroupMember: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("postAccessCheck: active member with space membership passes", () => {
  const result = postAccessCheck(post, {
    uid: "u2",
    isOwner: false,
    isActiveSub: true,
    isSpaceMember: true,
    isGroupMember: true,
  });
  assert.equal(result.ok, true);
});

test("nextLikeState: first like adds and counts 1", () => {
  const state = nextLikeState({}, "u1");
  assert.equal(state.already, false);
  assert.equal(state.liked, true);
  assert.equal(state.count, 1);
});

test("nextLikeState: unlike removes and counts back to 0", () => {
  const state = nextLikeState({ u1: true, u2: true }, "u1");
  assert.equal(state.already, true);
  assert.equal(state.liked, false);
  assert.equal(state.count, 1);
});

test("nextLikeState: toggle is idempotent over repeated calls", () => {
  const first = nextLikeState({ u1: true }, "u1");
  assert.equal(first.liked, false);
  const second = nextLikeState({}, "u1");
  assert.equal(second.liked, true);
});

test("validatePostText: requires non-empty text", () => {
  assert.equal(validatePostText("").ok, false);
  assert.equal(validatePostText("   ").ok, false);
  assert.equal(validatePostText(null).ok, false);
  assert.equal(validatePostText(42).ok, false);
});

test("validatePostText: trims and accepts valid text", () => {
  const res = validatePostText("  hello  ");
  assert.equal(res.ok, true);
  assert.equal(res.text, "hello");
});

test("validatePostText: rejects over-long text", () => {
  const res = validatePostText("a".repeat(POST_TEXT_MAX + 1));
  assert.equal(res.ok, false);
  assert.match(res.error, /too long/i);
  assert.equal(validatePostText("a".repeat(POST_TEXT_MAX)).ok, true);
});

test("validateCommentText: requires non-empty and enforces 2000 limit", () => {
  assert.equal(validateCommentText("").ok, false);
  assert.equal(validateCommentText("ok").ok, true);
  assert.equal(validateCommentText("x".repeat(2001)).ok, false);
  assert.equal(validateCommentText("x".repeat(2000)).ok, true);
});

test("isValidImageUrl: empty is allowed", () => {
  assert.equal(isValidImageUrl(""), true);
  assert.equal(isValidImageUrl(null), true);
  assert.equal(isValidImageUrl(undefined), true);
});

test("isValidImageUrl: accepts http(s) absolute URLs", () => {
  assert.equal(isValidImageUrl("https://example.com/photo.png"), true);
  assert.equal(isValidImageUrl("http://example.com/a.png"), true);
});

test("isValidImageUrl: rejects junk, other schemes and over-long urls", () => {
  assert.equal(isValidImageUrl("javascript:alert(1)"), false);
  assert.equal(isValidImageUrl("file:///etc/passwd"), false);
  assert.equal(isValidImageUrl("not a url"), false);
  assert.equal(isValidImageUrl(123), false);
  assert.equal(isValidImageUrl("https://example.com/" + "a".repeat(2500)), false);
});

test("isValidImageUrl: accepts data:image URLs within size limit", () => {
  assert.equal(isValidImageUrl("data:image/jpeg;base64,/9j/4AAQ"), true);
  assert.equal(isValidImageUrl("data:image/png;base64,iVBOR"), true);
  assert.equal(
    isValidImageUrl("data:image/jpeg;base64," + "a".repeat(699_000)),
    true
  );
  assert.equal(
    isValidImageUrl("data:image/jpeg;base64," + "a".repeat(700_000)),
    false
  );
  assert.equal(isValidImageUrl("data:video/mp4;base64,AAAA"), false);
});

test("encodeCursor/decodeCursor: round-trips compound keys", () => {
  const keys = [
    { pinned: false, createdAt: 1_700_000_000_000, id: "cmu123" },
    { pinned: true, createdAt: 0, id: "welcome-vault" },
    { pinned: false, createdAt: 123, id: "a/b+c=d" },
    { pinned: true, createdAt: 9_999_999_999_999, id: "1234567890" },
  ];
  for (const key of keys) {
    assert.deepEqual(decodeCursor(encodeCursor(key)), {
      pinned: key.pinned,
      createdAt: key.createdAt,
      id: key.id,
    });
  }
});

test("decodeCursor: tolerates junk and empty values", () => {
  assert.equal(decodeCursor(""), null);
  assert.equal(decodeCursor(null), null);
  assert.equal(decodeCursor("!!not-base64!!"), null);
  assert.equal(decodeCursor("bm90LWEtalNvbg"), null);
  assert.equal(encodeCursor({ id: "" }), "");
  assert.equal(encodeCursor(null), "");
  assert.equal(encodeCursor(""), "");
});

test("feedOrderBy: pinned first, newest, then id tiebreak", () => {
  assert.deepEqual(feedOrderBy(), [
    { pinned: "desc" },
    { createdAt: "desc" },
    { id: "desc" },
  ]);
});

test("paginatePostRows: slices page and exposes opaque nextCursor", () => {
  const rows = [
    { id: "p1", pinned: false, createdAt: 3_000 },
    { id: "p2", pinned: false, createdAt: 2_000 },
    { id: "p3", pinned: false, createdAt: 1_000 },
  ];
  const page = paginatePostRows(rows, 2);
  assert.equal(page.posts.length, 2);
  assert.equal(page.posts[0].id, "p1");
  assert.equal(page.hasMore, true);
  assert.deepEqual(decodeCursor(page.nextCursor), {
    pinned: false,
    createdAt: 2_000,
    id: "p2",
  });

  const end = paginatePostRows(rows.slice(0, 2), 2);
  assert.equal(end.hasMore, false);
  assert.equal(end.nextCursor, null);
});

test("isSystemPost: the announcement has no author and is still system", () => {
  assert.equal(isSystemPost({ kind: "announcement", authorId: null }), true);
});

test("isSystemPost: a legacy authorId of \"system\" still counts", () => {
  assert.equal(isSystemPost({ kind: "announcement", authorId: "system" }), true);
});

test("isSystemPost: an ordinary member post is never system", () => {
  assert.equal(isSystemPost({ kind: "post", authorId: "abc" }), false);
  assert.equal(isSystemPost({ kind: "poll", authorId: "abc" }), false);
});

test("isSystemPost: undefined authorId is not system", () => {
  assert.equal(isSystemPost({ kind: "announcement" }), false);
  assert.equal(isSystemPost({ kind: "post", authorId: undefined }), false);
});

// The reason the kind check exists. Post.authorId is nullable now, and if the
// foreign key ever falls back to SetNull a deleted account's posts arrive with
// authorId: null. Treating those as system posts would make them undeletable,
// uncommentable and unreportable.
test("isSystemPost: an orphaned post from a deleted author is NOT system", () => {
  assert.equal(isSystemPost({ kind: "post", authorId: null }), false);
  assert.equal(isSystemPost({ kind: "question", authorId: null }), false);
  assert.equal(isSystemPost({ kind: "win", authorId: null }), false);
  assert.equal(isSystemPost({ kind: null, authorId: null }), false);
});

test("isSystemPost: tolerates a missing post", () => {
  assert.equal(isSystemPost(null), false);
  assert.equal(isSystemPost(undefined), false);
});

// ---------------------------------------------------------------------------
// Post lifecycle (edit / trash / schedule / hide)
// ---------------------------------------------------------------------------

test("mapPostRow: exposes the lifecycle fields with safe defaults", () => {
  const mapped = mapPostRow({ id: "p1", text: "hi", createdAt: 5 });
  assert.equal(mapped.editedAt, 0);
  assert.equal(mapped.deletedAt, 0);
  assert.equal(mapped.hidden, false);
  assert.equal(mapped.lockedComments, false);
  assert.equal(mapped.sensitive, false);
  assert.equal(mapped.scheduledAt, 0);
  assert.equal(mapped.repostOfId, "");
  assert.equal(mapped.quoteOfId, "");
});

test("mapPostRow: carries edited/deleted/scheduled timestamps as millis", () => {
  const when = new Date("2026-01-02T03:04:05.000Z");
  const mapped = mapPostRow({ id: "p1", text: "hi", editedAt: when, deletedAt: when, scheduledAt: when });
  assert.equal(mapped.editedAt, when.getTime());
  assert.equal(mapped.deletedAt, when.getTime());
  assert.equal(mapped.scheduledAt, when.getTime());
});

test("livePostWhere: excludes trash and not-yet-due scheduled posts", () => {
  const where = livePostWhere();
  assert.equal(where.deletedAt, null);
  assert.deepEqual(where.OR[0], { scheduledAt: null });
  assert.ok(where.OR[1].scheduledAt.lte instanceof Date);
});

test("feedWhere: combines live + cursor + tag without losing an OR clause", () => {
  const cursor = { pinned: false, createdAt: Date.now(), id: "p9" };
  const where = feedWhere({ cursor, tag: "yarn" });
  assert.equal(where.deletedAt, null);
  assert.equal(where.archivedAt, null);
  // live schedule filter, cursor keyset, hashtag
  assert.equal(where.AND.length, 3);
  assert.ok(where.AND.some((clause) => clause.hashtags?.has === "yarn"));
  assert.ok(where.AND.some((clause) => Array.isArray(clause.OR) && !clause.hashtags));
});

test("feedWhere: adds an author-visible branch for the viewer's own scheduled posts", () => {
  const where = feedWhere({ uid: "u1" });
  const authorBranch = where.AND.find((clause) => clause.OR?.some((c) => c.authorId === "u1"));
  assert.ok(authorBranch, "own scheduled posts must remain visible to their author");
});

test("editPostCheck: author may edit their own post", () => {
  assert.equal(editPostCheck({ authorId: "u1", kind: "post" }, { uid: "u1" }).ok, true);
});

test("editPostCheck: another member cannot edit it", () => {
  const res = editPostCheck({ authorId: "u1", kind: "post" }, { uid: "u2" });
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
});

test("editPostCheck: a moderator may edit someone else's post", () => {
  assert.equal(editPostCheck({ authorId: "u1", kind: "post" }, { uid: "u2", isModerator: true }).ok, true);
  assert.equal(editPostCheck({ authorId: "u1", kind: "post" }, { uid: "u2", isOwner: true }).ok, true);
});

test("editPostCheck: the read-only announcement cannot be edited", () => {
  const res = editPostCheck({ authorId: null, kind: "announcement" }, { uid: "u1", isOwner: true });
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
});

test("editPostCheck: a trashed post cannot be edited", () => {
  const res = editPostCheck({ authorId: "u1", kind: "post", deletedAt: new Date() }, { uid: "u1" });
  assert.equal(res.ok, false);
  assert.equal(res.status, 404);
});

test("editPostCheck: poll options are locked after publishing", () => {
  const res = editPostCheck({ authorId: "u1", kind: "poll" }, { uid: "u1" });
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test("TRASH_RETENTION_MS is a 30-day window", () => {
  assert.equal(TRASH_RETENTION_MS, 30 * 24 * 60 * 60 * 1000);
});

test("SCHEDULE_MAX_MS is a one-year horizon", () => {
  assert.equal(SCHEDULE_MAX_MS, 365 * 24 * 60 * 60 * 1000);
});

