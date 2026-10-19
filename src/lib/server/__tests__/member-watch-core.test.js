import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WATCH_ONLINE_COOLDOWN_MS,
  WATCH_ROOM_COOLDOWN_MS,
  canWatch,
  onlineNotifyText,
  roomNotifyText,
  shouldNotifyOnline,
  shouldNotifyRoom,
} from "../member-watch-core.js";

const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const MIN = 60_000;

// ------------------------------------------------------------- pair guards

test("a member can watch anyone but themselves", () => {
  assert.equal(canWatch("a", "b"), true);
  assert.equal(canWatch("a", "a"), false);
  assert.equal(canWatch("", "b"), false);
  assert.equal(canWatch("a", ""), false);
  assert.equal(canWatch(null, undefined), false);
});

// ------------------------------------------------------------------ online

test("the first online event for a pair always notifies", () => {
  assert.equal(shouldNotifyOnline({ lastOnlineNotifiedAt: null, now: NOW }), true);
  assert.equal(shouldNotifyOnline({ lastOnlineNotifiedAt: undefined, now: NOW }), true);
  assert.equal(shouldNotifyOnline({ lastOnlineNotifiedAt: "not-a-date", now: NOW }), true);
});

test("online stays quiet until the cooldown expires", () => {
  const recent = NOW - WATCH_ONLINE_COOLDOWN_MS + MIN;
  assert.equal(shouldNotifyOnline({ lastOnlineNotifiedAt: recent, now: NOW }), false);

  const stale = NOW - WATCH_ONLINE_COOLDOWN_MS - 1;
  assert.equal(shouldNotifyOnline({ lastOnlineNotifiedAt: stale, now: NOW }), true);
});

test("online accepts Date, ISO string and epoch values", () => {
  assert.equal(shouldNotifyOnline({ lastOnlineNotifiedAt: new Date(NOW - MIN), now: NOW }), false);
  assert.equal(shouldNotifyOnline({ lastOnlineNotifiedAt: new Date(NOW).toISOString(), now: NOW }), false);
  assert.equal(
    shouldNotifyOnline({ lastOnlineNotifiedAt: NOW - WATCH_ONLINE_COOLDOWN_MS, now: NOW }),
    true
  );
});

// -------------------------------------------------------------------- room

test("entering a lounge for the first time notifies", () => {
  assert.equal(shouldNotifyRoom({ lastRoomId: null, lastRoomNotifiedAt: null, roomId: "r1", now: NOW }), true);
});

test("a different lounge notifies even inside the cooldown", () => {
  assert.equal(
    shouldNotifyRoom({
      lastRoomId: "r1",
      lastRoomNotifiedAt: NOW - MIN,
      roomId: "r2",
      now: NOW,
    }),
    true
  );
});

test("re-entering the same lounge inside the cooldown stays quiet", () => {
  assert.equal(
    shouldNotifyRoom({
      lastRoomId: "r1",
      lastRoomNotifiedAt: NOW - WATCH_ROOM_COOLDOWN_MS + MIN,
      roomId: "r1",
      now: NOW,
    }),
    false
  );
});

test("re-entering the same lounge after the cooldown notifies", () => {
  assert.equal(
    shouldNotifyRoom({
      lastRoomId: "r1",
      lastRoomNotifiedAt: NOW - WATCH_ROOM_COOLDOWN_MS - 1,
      roomId: "r1",
      now: NOW,
    }),
    true
  );
});

test("an unknown target room never notifies", () => {
  assert.equal(shouldNotifyRoom({ lastRoomId: null, lastRoomNotifiedAt: null, roomId: "", now: NOW }), false);
});

// ------------------------------------------------------------- notification text

test("texts continue the member's name and stay one sentence", () => {
  assert.equal(onlineNotifyText(), "is now online.");
  assert.equal(roomNotifyText("Happy Hour Hub"), "joined Happy Hour Hub.");
  // A missing room name falls back rather than leaking "joined ." or the id.
  assert.equal(roomNotifyText("  "), "joined a lounge.");
  assert.equal(roomNotifyText(undefined), "joined a lounge.");
});
