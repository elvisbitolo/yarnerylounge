import { test } from "node:test";
import assert from "node:assert/strict";
import { mapUserRow, mapLeaderboardMemberRow } from "../members-core.js";

test("mapUserRow: null stays null", () => {
  assert.equal(mapUserRow(null), null);
});

test("mapUserRow: maps a full Postgres row", () => {
  const row = {
    id: "u1",
    name: "Elena Vance",
    username: "elena.v",
    photoURL: "https://img/x.png",
    role: "host",
    plan: "moving-in",
    crafts: ["crochet", "knitting"],
    hobbies: ["baking"],
    points: 120,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
  };
  const u = mapUserRow(row);
  assert.equal(u.id, "u1");
  assert.equal(u.name, "Elena Vance");
  assert.equal(u.role, "host");
  assert.equal(u.plan, "moving-in");
  assert.deepEqual(u.crafts, ["crochet", "knitting"]);
  assert.equal(u.hobbies.length, 1);
  assert.equal(u.createdAt, new Date("2026-01-01T00:00:00Z").getTime());
});

test("mapUserRow: blank row yields safe defaults", () => {
  const u = mapUserRow({ id: "x" });
  assert.equal(u.id, "x");
  assert.equal(u.name, "");
  assert.equal(u.role, "member");
  assert.equal(u.plan, "flirting");
  assert.equal(u.expiresAt, 0);
  assert.deepEqual(u.crafts, []);
  assert.deepEqual(u.hobbies, []);
  assert.equal(u.foundingMember, false);
  assert.equal(u.createdAt, 0);
});

test("mapUserRow: string dates normalize to millis", () => {
  const u = mapUserRow({ id: "x", createdAt: "2026-01-01T00:00:00Z" });
  assert.equal(u.createdAt, new Date("2026-01-01T00:00:00Z").getTime());
});

test("mapLeaderboardMemberRow: ranks and badge counts", () => {
  const row = {
    id: "u2",
    name: "Alex",
    points: 250,
    badges: { streak_3: { name: "3 Day" }, first_post: { name: "First" } },
  };
  const m = mapLeaderboardMemberRow(row, 4);
  assert.equal(m.userId, "u2");
  assert.equal(m.points, 250);
  assert.equal(m.badgeCount, 2);
  assert.equal(m.rank, 5);
});

test("mapLeaderboardMemberRow: null-friendly badges", () => {
  const m = mapLeaderboardMemberRow({ id: "u3", points: 0, badges: null }, 0);
  assert.equal(m.badgeCount, 0);
  assert.equal(m.rank, 1);
});
