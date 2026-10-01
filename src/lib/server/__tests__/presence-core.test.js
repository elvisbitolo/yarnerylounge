import test from "node:test";
import assert from "node:assert/strict";
import {
  PRESENCE_WINDOW_MS,
  ONLINE_MEMBER_LIMIT,
  lastActiveFrom,
  isOnline,
  isOnlineRow,
  onlineMembers,
} from "../presence-core.js";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");

test("isOnline: recent heartbeat is online", () => {
  assert.equal(isOnline("2026-10-01T11:59:30.000Z", NOW), true);
});

test("isOnline: stale heartbeat is offline", () => {
  assert.equal(isOnline("2026-10-01T11:57:00.000Z", NOW), false);
});

test("isOnline: exactly on the window boundary counts as online", () => {
  const boundary = new Date(NOW - PRESENCE_WINDOW_MS).toISOString();
  assert.equal(isOnline(boundary, NOW), true);
});

test("isOnline: missing or malformed stamps are offline", () => {
  assert.equal(isOnline(null, NOW), false);
  assert.equal(isOnline(undefined, NOW), false);
  assert.equal(isOnline("not-a-date", NOW), false);
});

test("isOnline: accepts epoch millis", () => {
  assert.equal(isOnline(NOW - 1000, NOW), true);
});

test("lastActiveFrom: reads the heartbeat out of JSON extra", () => {
  assert.equal(lastActiveFrom({ lastActiveAt: "x" }), "x");
  assert.equal(lastActiveFrom({}), null);
  assert.equal(lastActiveFrom(null), null);
  assert.equal(lastActiveFrom("nope"), null);
});

test("isOnlineRow: reads nested extra", () => {
  assert.equal(isOnlineRow({ extra: { lastActiveAt: "2026-10-01T11:59:30.000Z" } }, NOW), true);
  assert.equal(isOnlineRow({ extra: {} }, NOW), false);
  assert.equal(isOnlineRow(null, NOW), false);
});

test("onlineMembers: excludes the viewer, filters stale rows and carries profile", () => {
  const rows = [
    { id: "a", name: "Ada", photoURL: "a.png", extra: { lastActiveAt: "2026-10-01T11:59:50.000Z" } },
    { id: "me", name: "Me", photoURL: "me.png", extra: { lastActiveAt: "2026-10-01T11:59:50.000Z" } },
    { id: "b", name: "Bea", photoURL: "", extra: { lastActiveAt: "2026-10-01T11:00:00.000Z" } },
    { id: "c", name: "Cy", photoURL: "c.png", extra: { lastActiveAt: "2026-10-01T11:59:00.000Z" } },
  ];
  const online = onlineMembers(rows, { now: NOW, excludeId: "me" });
  assert.deepEqual(online, [
    { uid: "a", name: "Ada", photoURL: "a.png" },
    { uid: "c", name: "Cy", photoURL: "c.png" },
  ]);
});

test("onlineMembers: caps the strip at the limit", () => {
  const rows = Array.from({ length: ONLINE_MEMBER_LIMIT + 5 }, (_, i) => ({
    id: `u${i}`,
    name: `User ${i}`,
    photoURL: "",
    extra: { lastActiveAt: new Date(NOW - 1000).toISOString() },
  }));
  assert.equal(onlineMembers(rows, { now: NOW }).length, ONLINE_MEMBER_LIMIT);
});

test("onlineMembers: tolerates a non-array input", () => {
  assert.deepEqual(onlineMembers(null, { now: NOW }), []);
});
