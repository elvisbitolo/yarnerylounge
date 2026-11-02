import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeImpressionPayload, isTrackablePost, newSessionKey, MAX_IMPRESSION_BATCH } from "../impressions-core.js";

test("sanitizeImpressionPayload rejects null", () => {
  assert.equal(sanitizeImpressionPayload(null), null);
});

test("sanitizeImpressionPayload rejects object without sessionKey", () => {
  assert.equal(sanitizeImpressionPayload({ postIds: [] }), null);
});

test("sanitizeImpressionPayload rejects invalid sessionKey", () => {
  assert.equal(sanitizeImpressionPayload({ sessionKey: "bad", postIds: ["p1"] }), null);
});

test("sanitizeImpressionPayload rejects invalid sessionKey too short", () => {
  assert.equal(sanitizeImpressionPayload({ sessionKey: "ab", postIds: ["p1"] }), null);
});

test("sanitizeImpressionPayload rejects postIds list exceeding max", () => {
  const longIds = Array(51).fill("p1");
  assert.equal(
    sanitizeImpressionPayload({ sessionKey: "validkey", postIds: longIds }).postIds.length,
    MAX_IMPRESSION_BATCH
  );
});

test("sanitizeImpressionPayload returns clean payload", () => {
  const result = sanitizeImpressionPayload({
    sessionKey: "abc12345",
    postIds: ["p1", "p2"],
  });
  assert.ok(result !== null);
  assert.deepStrictEqual(result.sessionKey, "abc12345");
  assert.deepStrictEqual(result.postIds, ["p1", "p2"]);
});

test("isTrackablePost returns false when authorId matches uid", () => {
  assert.equal(isTrackablePost({ postId: "p1", authorId: "u1" }, { uid: "u1" }), false);
});

test("isTrackablePost returns false when post has deletedAt", () => {
  assert.equal(isTrackablePost({ postId: "p1", authorId: "u2", deletedAt: new Date() }, { uid: "u1" }), false);
});

test("isTrackablePost returns false when post has archivedAt", () => {
  assert.equal(isTrackablePost({ postId: "p1", authorId: "u2", archivedAt: new Date() }, { uid: "u1" }), false);
});

test("isTrackablePost returns false when post is hidden and not staff", () => {
  assert.equal(isTrackablePost({ postId: "p1", authorId: "u2", hidden: true }, { uid: "u1", isStaff: false }), false);
});

test("isTrackablePost returns false when post is hidden and IS staff", () => {
  assert.equal(isTrackablePost({ postId: "p1", authorId: "u2", hidden: true }, { uid: "u1", isStaff: true }), true);
});

test("isTrackablePost returns false when post is scheduled in future and not staff", () => {
  const future = Date.now() + 86400000; // tomorrow
  assert.equal(isTrackablePost({ postId: "p1", authorId: "u2", scheduledAt: new Date(future) }, { uid: "u1", isStaff: false }), false);
});

test("isTrackablePost returns false when post has spaceId not in spaces and not staff", () => {
  assert.equal(isTrackablePost({ postId: "p1", authorId: "u2", spaceId: "s1" }, { uid: "u1", isStaff: false, spaces: new Set() }), false);
});

test("isTrackablePost returns false when post has groupId not in groups and not staff", () => {
  assert.equal(isTrackablePost({ postId: "p1", authorId: "u2", groupId: "g1" }, { uid: "u1", isStaff: false, groups: new Set() }), false);
});

test("isTrackablePost returns true for a post the viewer can track", () => {
  assert.equal(isTrackablePost({ postId: "p1", authorId: "u2" }, { uid: "u1" }), true);
});

test("isTrackablePost returns true for a hidden post viewed by staff", () => {
  assert.equal(isTrackablePost({ postId: "p1", authorId: "u2", hidden: true }, { uid: "u1", isStaff: true }), true);
});

test("newSessionKey returns a non-empty string", () => {
  const key = newSessionKey();
  assert.ok(typeof key === "string" && key.length > 0);
});