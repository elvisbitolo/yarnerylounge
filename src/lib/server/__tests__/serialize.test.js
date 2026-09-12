import { test } from "node:test";
import assert from "node:assert/strict";
import { serialize, serializeTimestamp } from "../serialize.js";

test("serializeTimestamp: null and undefined stay null", () => {
  assert.equal(serializeTimestamp(null), null);
  assert.equal(serializeTimestamp(undefined), null);
});

test("serializeTimestamp: Timestamp-like object serializes to millis", () => {
  const ts = { toMillis: () => 1234567890 };
  assert.equal(serializeTimestamp(ts), 1234567890);
});

test("serializeTimestamp: Date serializes to millis", () => {
  assert.equal(serializeTimestamp(new Date(1700000000000)), 1700000000000);
});

test("serializeTimestamp: plain values pass through", () => {
  assert.equal(serializeTimestamp("keep"), "keep");
  assert.equal(serializeTimestamp(42), 42);
});

test("serialize: recursively converts timestamps and dates", () => {
  const input = {
    name: "event",
    startsAt: { toMillis: () => 111 },
    nested: {
      date: new Date(222),
      list: [{ at: { toMillis: () => 333 } }],
    },
  };
  assert.deepEqual(serialize(input), {
    name: "event",
    startsAt: 111,
    nested: {
      date: 222,
      list: [{ at: 333 }],
    },
  });
});

test("serialize: handles arrays and primitives", () => {
  assert.deepEqual(serialize([{ t: { toMillis: () => 5 } }, "x", null]), [{ t: 5 }, "x", null]);
  assert.equal(serialize("str"), "str");
  assert.equal(serialize(7), 7);
  assert.equal(serialize(null), null);
});
