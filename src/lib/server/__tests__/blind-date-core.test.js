import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKeyFor,
  hashingKey,
  seededPick,
  profilePieces,
  tierWeight,
  computeScore,
} from "../blind-date-core.js";

test("dayKeyFor: formats an ISO UTC date (YYYY-MM-DD)", () => {
  assert.equal(dayKeyFor(Date.parse("2026-09-07T15:30:00Z")), "2026-09-07");
  assert.equal(dayKeyFor(Date.parse("2026-01-05T23:59:59Z")), "2026-01-05");
});

test("hashingKey: composes uid and date", () => {
  assert.equal(hashingKey("abc", "2026-09-07"), "abc:2026-09-07");
  assert.equal(hashingKey("abc"), "abc:");
});

test("seededPick: is deterministic per user+day", () => {
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const first = seededPick(candidates, "u1", "2026-09-07");
  const second = seededPick(candidates, "u1", "2026-09-07");
  assert.equal(second.id, first.id);
  // Different day picks from the same candidates.
  const nextDay = seededPick(candidates, "u1", "2026-09-08");
  assert.equal(typeof nextDay.id, "string");
  assert.ok(candidates.some((c) => c.id === nextDay.id));
});

test("seededPick: returns null for empty candidates", () => {
  assert.equal(seededPick([], "u1", "2026-09-07"), null);
  assert.equal(seededPick(null, "u1", "2026-09-07"), null);
});

test("computeScore: same country adds 4 points (weighted by host tier)", () => {
  const me = { country: "US", hobbies: [], crafts: [], favoriteColors: [] };
  const member = { country: "US", hobbies: [], crafts: [], favoriteColors: [], role: "member" };
  assert.equal(computeScore(me, member), 4);
  const host = { ...member, role: "host" };
  assert.equal(computeScore(me, host), 4 * 1.3);
});

test("computeScore: hobby overlap weights shared crafts/hobbies/colors", () => {
  const me = {
    country: "",
    hobbies: ["crochet"],
    crafts: ["granny squares"],
    favoriteColors: ["teal"],
  };
  const member = {
    country: "",
    hobbies: ["crochet", "knitting"],
    crafts: ["granny squares"],
    favoriteColors: ["teal"],
    role: "member",
  };
  // 4 shared text words (crochet, granny, squares, teal) + 1 shared hobby *3
  // + 1 shared craft *2 + 1 shared color *2 = 11
  assert.equal(computeScore(me, member), 11);
});

test("computeScore: profile text overlap raises the score", () => {
  const base = { country: "", hobbies: [], crafts: [], favoriteColors: [] };
  const me = { ...base, headline: "amigurumi monster maker" };
  const member = { ...base, headline: "amigurumi patterns", bio: "maker" };
  assert.ok(computeScore(me, member) > 0);
  assert.equal(computeScore(me, base), 0);
});

test("tierWeight: hosts weigh more than ordinary members", () => {
  assert.equal(tierWeight({ role: "host" }), 1.3);
  assert.equal(tierWeight({ role: "moderator" }), 1.2);
  assert.equal(tierWeight({ role: "member" }), 1);
});

test("profilePieces: joins the searchable fields, lowercased", () => {
  const pieces = profilePieces({
    headline: "Slow Hooker",
    bio: "Loves granny squares",
    hobbies: ["Crochet", "Tea"],
    crafts: ["Blankets"],
    country: "CA",
    favoriteColors: ["Teal"],
  });
  assert.ok(pieces.includes("slow hooker"));
  assert.ok(pieces.includes("crochet tea"));
  assert.ok(pieces.includes("blankets"));
  assert.ok(pieces.includes("ca"));
});