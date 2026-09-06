import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERS, tierRank, tierLabel, meetsTier, tierBadge } from "../plans.js";

test("TIERS order is flirting, hooking-up, moving-in", () => {
  assert.deepEqual(TIERS, ["flirting", "hooking-up", "moving-in"]);
});

test("tierRank orders tiers", () => {
  assert.equal(tierRank("flirting"), 0);
  assert.equal(tierRank("hooking-up"), 1);
  assert.equal(tierRank("moving-in"), 2);
  assert.equal(tierRank("unknown"), -1);
});

test("tierRank maps legacy tiers", () => {
  assert.equal(tierRank("lounge"), 0);
  assert.equal(tierRank("plus"), 1);
  assert.equal(tierRank("host"), 2);
  assert.equal(tierRank("standard"), 0);
  assert.equal(tierRank("premium"), 1);
  assert.equal(tierRank("community"), 0);
  assert.equal(tierRank("creator"), 1);
  assert.equal(tierRank("free"), 0);
  assert.equal(tierRank("none"), 0);
});

test("tierLabel maps tiers and defaults", () => {
  assert.equal(tierLabel("flirting"), "Flirting");
  assert.equal(tierLabel("hooking-up"), "Hooking Up");
  assert.equal(tierLabel("moving-in"), "Moving In");
  assert.equal(tierLabel("lounge"), "Flirting");
  assert.equal(tierLabel("plus"), "Hooking Up");
  assert.equal(tierLabel("host"), "Moving In");
  assert.equal(tierLabel("nope"), "Flirting");
});

test("tierBadge: flirting has none, paid tiers have icon", () => {
  assert.equal(tierBadge("flirting"), null);
  assert.equal(tierBadge("hooking-up").icon, "👑");
  assert.equal(tierBadge("moving-in").icon, "💎");
  assert.equal(tierBadge("lounge"), null);
  assert.equal(tierBadge("host").icon, "💎");
});

test("meetsTier: no requirement or flirting requirement is always met", () => {
  assert.equal(meetsTier("flirting", undefined), true);
  assert.equal(meetsTier("hooking-up", "flirting"), true);
  assert.equal(meetsTier(null, "flirting"), true);
  assert.equal(meetsTier(null, null), true);
});

test("meetsTier: moving-in requirement gates lower tiers", () => {
  assert.equal(meetsTier("flirting", "moving-in"), false);
  assert.equal(meetsTier("hooking-up", "moving-in"), false);
  assert.equal(meetsTier("moving-in", "moving-in"), true);
});

test("meetsTier: hooking-up requirement gates flirting", () => {
  assert.equal(meetsTier("flirting", "hooking-up"), false);
  assert.equal(meetsTier("hooking-up", "hooking-up"), true);
  assert.equal(meetsTier("moving-in", "hooking-up"), true);
});

test("meetsTier: legacy premium requirement maps through aliases", () => {
  assert.equal(meetsTier("flirting", "premium"), false);
  assert.equal(meetsTier("hooking-up", "premium"), true);
  assert.equal(meetsTier("moving-in", "premium"), true);
});