import { test } from "node:test";
import assert from "node:assert/strict";
import { mapGamificationRow, mapLeaderboardRow } from "../gamification-core.js";

test("mapGamificationRow: null stays null", () => {
  assert.equal(mapGamificationRow(null), null);
});

test("mapGamificationRow: maps a full Postgres row", () => {
  const row = {
    id: "u1",
    points: 120,
    streak: 7,
    bestStreak: 12,
    badges: { streak_3: { name: "3 Day Streak" } },
    lastVisitDate: "2026-09-07",
    recentVisits: ["2026-09-05", "2026-09-06", "2026-09-07"],
    name: "Elena",
  };
  const g = mapGamificationRow(row);
  assert.equal(g.points, 120);
  assert.equal(g.streak, 7);
  assert.equal(g.bestStreak, 12);
  assert.equal(g.badges.streak_3.name, "3 Day Streak");
  assert.equal(g.recentVisits.length, 3);
  assert.equal(g.name, "Elena");
});

test("mapGamificationRow: blank row yields safe defaults", () => {
  const g = mapGamificationRow({});
  assert.equal(g.points, 0);
  assert.equal(g.streak, 0);
  assert.deepEqual(g.badges, {});
  assert.deepEqual(g.recentVisits, []);
  assert.equal(g.name, "Member");
});

test("mapGamificationRow: non-object badges become empty object", () => {
  const g = mapGamificationRow({ badges: "not-an-object" });
  assert.deepEqual(g.badges, {});
});

test("mapLeaderboardRow: maps with rank", () => {
  const row = { id: "u1", name: "Elena", points: 200, streak: 5, badges: { a: {}, b: {} } };
  const entry = mapLeaderboardRow(row, 0);
  assert.equal(entry.userId, "u1");
  assert.equal(entry.rank, 1);
  assert.equal(entry.points, 200);
  assert.equal(entry.badgeCount, 2);
});