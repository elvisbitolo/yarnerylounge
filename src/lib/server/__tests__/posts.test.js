import { test } from "node:test";
import assert from "node:assert/strict";
import {
  postAccessCheck,
  nextLikeState,
  validatePostText,
  validateCommentText,
  isValidImageUrl,
  POST_TEXT_MAX,
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
