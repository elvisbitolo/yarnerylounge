import { test } from "node:test";
import assert from "node:assert/strict";
import { isRoomLive, mapRoomRow, pickBannerRooms } from "../rooms-core.js";

test("isRoomLive: always-on rooms stay live despite a stale schedule", () => {
  assert.equal(
    isRoomLive({ status: "active", alwaysOn: true, opensAt: new Date(Date.now() + 86_400_000) }),
    true
  );
});

test("isRoomLive: scheduled rooms open at their start time", () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(isRoomLive({ status: "active", opensAt: now + 1 }, now), false);
  assert.equal(isRoomLive({ status: "active", opensAt: now }, now), true);
});

test("mapRoomRow: null stays null", () => {
  assert.equal(mapRoomRow(null), null);
});

test("mapRoomRow: maps a full Postgres row", () => {
  const row = {
    id: "r1",
    name: "Happy Hour Hub",
    slug: "happy-hour-hub",
    description: "Unwind room",
    status: "active",
    maxParticipants: 20,
    groupId: null,
    spaceId: null,
    kind: "standard",
    publicPreview: false,
    opensAt: null,
    alwaysOn: true,
    color: "#e91e63",
    vibe: "social",
    vibeMode: "auto",
    rule: "Rule",
    musicUrl: "",
    musicPlaying: false,
    musicFileId: "",
    createdBy: "u1",
    createdAt: new Date(),
  };
  const room = mapRoomRow(row);
  assert.equal(room.id, "r1");
  assert.equal(room.name, "Happy Hour Hub");
  assert.equal(room.slug, "happy-hour-hub");
  assert.equal(room.maxParticipants, 20);
  assert.equal(room.alwaysOn, true);
  assert.equal(room.kind, "standard");
});

test("mapRoomRow: blank row yields safe defaults", () => {
  const room = mapRoomRow({ id: "x" });
  assert.equal(room.name, "");
  assert.equal(room.slug, "x");
  assert.equal(room.status, "active");
  assert.equal(room.maxParticipants, 20);
  assert.equal(room.kind, "standard");
  assert.equal(room.publicPreview, false);
  assert.equal(room.opensAt, null);
});

test("mapRoomRow: pinned defaults to false when absent", () => {
  assert.equal(mapRoomRow({ id: "x" }).pinned, false);
  assert.equal(mapRoomRow({ id: "x", pinned: true }).pinned, true);
});

// The banner renders rooms[0] and collapses the rest into "+N more", so the
// first element is the room every visitor sees promoted.
const at = (mins) => ({ toMillis: () => Date.UTC(2026, 0, 1, 0, mins) });

test("pickBannerRooms: a pinned room outranks creation order", () => {
  // The real case: Happy Hour Hub is the oldest of the four, so it lost the
  // banner to the newest room purely on creation time.
  const oldest = { name: "Happy Hour Hub", pinned: true, createdAt: at(0) };
  const newest = { name: "The Silent Studio", createdAt: at(30) };
  const picked = pickBannerRooms([newest, oldest]);
  assert.equal(picked[0].name, "Happy Hour Hub");
});

test("pickBannerRooms: pinning wins over the broadcast tier", () => {
  const picked = pickBannerRooms([
    { name: "Broadcast", kind: "broadcast", createdAt: at(30) },
    { name: "Pinned", pinned: true, createdAt: at(0) },
  ]);
  assert.equal(picked[0].name, "Pinned");
});

test("pickBannerRooms: broadcast still outranks plain rooms when nothing is pinned", () => {
  const picked = pickBannerRooms([
    { name: "Plain", createdAt: at(30) },
    { name: "Broadcast", kind: "broadcast", createdAt: at(0) },
  ]);
  assert.equal(picked[0].name, "Broadcast");
});

test("pickBannerRooms: unpinned rooms still fall back to newest first", () => {
  const picked = pickBannerRooms([
    { name: "Middle", createdAt: at(15) },
    { name: "Newest", createdAt: at(30) },
    { name: "Oldest", createdAt: at(0) },
  ]);
  assert.deepEqual(picked.map((r) => r.name), ["Newest", "Middle", "Oldest"]);
});

test("pickBannerRooms: honours the limit and does not mutate the input", () => {
  const input = [
    { name: "A", createdAt: at(0) },
    { name: "B", createdAt: at(20) },
    { name: "C", createdAt: at(10) },
  ];
  const snapshot = input.map((r) => r.name);
  const picked = pickBannerRooms(input, 2);
  assert.deepEqual(picked.map((r) => r.name), ["B", "C"]);
  assert.deepEqual(input.map((r) => r.name), snapshot);
});

test("pickBannerRooms: rooms with no createdAt do not throw", () => {
  const picked = pickBannerRooms([{ name: "NoDate" }, { name: "Dated", createdAt: at(1) }]);
  assert.equal(picked[0].name, "Dated");
  assert.equal(picked[1].name, "NoDate");
});
