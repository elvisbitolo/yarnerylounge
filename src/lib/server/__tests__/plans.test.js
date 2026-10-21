import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERS, tierRank, tierLabel, meetsTier, tierBadge, displayTier, memberBadgeTooltip } from "../plans.js";

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

test("tier names are matched case-insensitively (real rows hold 'Moving In')", () => {
  assert.equal(tierLabel("Moving In"), "Moving In");
  assert.equal(tierLabel("moving in"), "Moving In");
  assert.equal(tierLabel("  MOVING-IN "), "Moving In");
  assert.equal(tierLabel("Hooking Up"), "Hooking Up");
  assert.equal(displayTier("Moving In", "member"), "moving-in");
  assert.equal(tierBadge("Hooking Up").icon, "crown");
  assert.equal(tierLabel(null), "Flirting");
  assert.equal(tierLabel(undefined), "Flirting");
});

test("memberBadgeTooltip always agrees with the glyph the badge draws", () => {
  // The directory bug: role precedence made the glyph a Diamond while a
  // plan-only title beside it read "Flirting member".
  assert.equal(memberBadgeTooltip("Moving In", "moderator"), "Moving In member");
  assert.equal(memberBadgeTooltip(null, "owner"), "Moving In member");
  assert.equal(memberBadgeTooltip("flirting", "host"), "Moving In member");
  assert.equal(memberBadgeTooltip("moving-in", "member"), "Moving In member");
  assert.equal(memberBadgeTooltip("hooking-up", "member"), "Hooking Up member");
  assert.equal(memberBadgeTooltip(null, "member"), "Flirting member");
  for (const [plan, role] of [
    ["flirting", "owner"],
    [null, "host"],
    ["moving-in", "member"],
    ["Moving In", "moderator"],
    ["premium", null],
  ]) {
    // The tooltip names the PRODUCT tier, not the badge's marketing label
    // ("Diamond"), but it must still name the tier the glyph is drawn from.
    const tier = displayTier(plan, role);
    assert.ok(tierBadge(tier));
    assert.equal(memberBadgeTooltip(plan, role), `${tierLabel(tier)} member`);
  }
});

test("the badge tooltip names the tier, not the badge label", () => {
  // The top tier's badge is marketed as "Diamond" (gem + cyan), but the plan
  // the member bought is "Moving In" everywhere else in the product.
  assert.equal(tierBadge("moving-in").label, "Diamond");
  assert.notEqual(memberBadgeTooltip("moving-in", "member"), "Diamond member");
  assert.equal(memberBadgeTooltip("moving-in", "member"), tierLabel("moving-in") + " member");
});

test("tierBadge: every tier has a distinct icon", () => {
  assert.equal(tierBadge("flirting").icon, "sparkles");
  assert.equal(tierBadge("hooking-up").icon, "crown");
  assert.equal(tierBadge("moving-in").icon, "gem");
  assert.equal(tierBadge("lounge").icon, "sparkles");
  assert.equal(tierBadge("host").icon, "gem");
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