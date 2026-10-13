import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMessageStarred,
  readStarredMessages,
  starredMessageIds,
  toggleStarInExtra,
} from "../chat-star-core.js";

describe("chat-star-core", () => {
  it("reads stars only for the given conversation", () => {
    const extra = {
      starredMessages: { a: { m1: 10 }, b: { m2: 20 } },
    };
    assert.deepEqual(readStarredMessages(extra, "a"), { m1: 10 });
    assert.deepEqual(readStarredMessages(extra, "c"), {});
    assert.deepEqual(readStarredMessages(null, "a"), {});
  });

  it("lists star ids for a conversation", () => {
    const extra = { starredMessages: { a: { m1: 10, m2: 20 } } };
    assert.deepEqual(starredMessageIds(extra, "a").sort(), ["m1", "m2"]);
    assert.deepEqual(starredMessageIds(extra, "b"), []);
  });

  it("checks whether a specific message is starred", () => {
    const extra = { starredMessages: { a: { m1: 10 } } };
    assert.equal(isMessageStarred(extra, "a", "m1"), true);
    assert.equal(isMessageStarred(extra, "a", "nope"), false);
    assert.equal(isMessageStarred(null, "a", "m1"), false);
  });

  it("adds a star with the given timestamp", () => {
    const next = toggleStarInExtra({}, "a", "m1", true, 1234);
    assert.deepEqual(readStarredMessages(next, "a"), { m1: 1234 });
  });

  it("removes a star", () => {
    const extra = { starredMessages: { a: { m1: 10, m2: 20 } } };
    const next = toggleStarInExtra(extra, "a", "m1", false);
    assert.deepEqual(readStarredMessages(next, "a"), { m2: 20 });
  });

  it("keeps other conversations and sibling extra keys intact", () => {
    const extra = {
      name: "someone",
      starredMessages: { a: { m1: 10 }, b: { m2: 20 } },
    };
    const next = toggleStarInExtra(extra, "a", "m3", true, 7);
    assert.equal(next.name, "someone");
    assert.deepEqual(readStarredMessages(next, "a"), { m1: 10, m3: 7 });
    assert.deepEqual(readStarredMessages(next, "b"), { m2: 20 });
  });
});