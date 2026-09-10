import { test } from "node:test";
import assert from "node:assert/strict";
import { isRoomLive, mapRoomRow } from "../rooms-core.js";

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
