import { test } from "node:test";
import assert from "node:assert/strict";
import {
  postAccessCheck,
  nextLikeState,
  validatePostText,
  validateCommentText,
  isValidImageUrl,
  POST_TEXT_MAX,
  encodeCursor,
  decodeCursor,
  feedOrderBy,
  paginatePostRows,
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
