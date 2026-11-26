import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billingTier,
  canSelfManageMembership,
  normalizeMembershipPlan,
  selfServicePlanAction,
} from "../membership-self-service.js";
import { checkoutLinksForTier } from "../shopify.js";

test("membership plan input accepts canonical and legacy names", () => {
  assert.equal(normalizeMembershipPlan("hooking-up"), "hooking-up");
  assert.equal(normalizeMembershipPlan(" Moving In "), "moving-in");
  assert.equal(normalizeMembershipPlan("plus"), "hooking-up");
  assert.equal(normalizeMembershipPlan("free"), "flirting");
  assert.equal(normalizeMembershipPlan("nope"), null);
  assert.equal(normalizeMembershipPlan(null), null);
});

test("staff roles cannot self-manage membership", () => {
  assert.equal(canSelfManageMembership("owner"), false);
  assert.equal(canSelfManageMembership("MODERATOR"), false);
  assert.equal(canSelfManageMembership("host"), true);
  assert.equal(canSelfManageMembership("member"), true);
  assert.equal(canSelfManageMembership(null), true);
});

test("billing tier uses the paid subscription and ignores open-access rows", () => {
  const now = Date.now();
  const future = new Date(now + 60 * 24 * 60 * 60 * 1000);
  assert.equal(
    billingTier({ plan: "flirting" }, { status: "active", tier: "hooking-up", currentPeriodEnd: future }, now),
    "hooking-up",
  );
  assert.equal(
    billingTier(
      { plan: "flirting" },
      { provider: "open-access", status: "active", tier: "moving-in", currentPeriodEnd: future },
      now,
    ),
    "flirting",
  );
});

test("billing tier treats canceled and expired plans as free", () => {
  const now = Date.now();
  const past = new Date(now - 24 * 60 * 60 * 1000);
  assert.equal(
    billingTier({ plan: "moving-in" }, { status: "canceled", tier: "moving-in", canceledAt: past }, now),
    "flirting",
  );
  assert.equal(
    billingTier({ plan: "hooking-up" }, { status: "active", tier: "hooking-up", currentPeriodEnd: past }, now),
    "flirting",
  );
});

test("upgrade links use the mapped Shopify variants as cart permalinks", () => {
  const hooking = checkoutLinksForTier("hooking-up");
  assert.equal(hooking.monthly.endsWith("/cart/51798261825769:1"), true);
  assert.equal(hooking.annual.endsWith("/cart/51798264447209:1"), true);

  const moving = checkoutLinksForTier("moving-in");
  assert.equal(moving.monthly.endsWith("/cart/51798268575977:1"), true);
  assert.equal(moving.annual.endsWith("/cart/51798277882089:1"), true);

  assert.deepEqual(checkoutLinksForTier("flirting"), {});
});

test("self-service actions keep upgrades external and allow paid downgrades", () => {
  assert.equal(selfServicePlanAction("flirting", "hooking-up"), "upgrade");
  assert.equal(selfServicePlanAction("flirting", "moving-in"), "upgrade");
  assert.equal(selfServicePlanAction("hooking-up", "moving-in"), "upgrade");
  assert.equal(selfServicePlanAction("moving-in", "hooking-up"), "downgrade");
  assert.equal(selfServicePlanAction("hooking-up", "flirting"), "cancel");
  assert.equal(selfServicePlanAction("moving-in", "flirting"), "cancel");
  assert.equal(selfServicePlanAction("hooking-up", "hooking-up"), "current");
  assert.equal(selfServicePlanAction("hooking-up", "nope"), "unavailable");
});
