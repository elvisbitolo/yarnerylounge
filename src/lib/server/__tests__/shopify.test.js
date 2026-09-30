import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHOPIFY_VARIANTS,
  variantById,
  mapShopifyLineItems,
  computeExpiresAt,
  buildSubscriptionDoc,
  shouldGrantMembership,
  mayWriteTier,
  roleAfterRevoke,
} from "../shopify.js";

test("SHOPIFY_VARIANTS covers all 5 documented variants", () => {
  assert.equal(SHOPIFY_VARIANTS.length, 5);
  const ids = SHOPIFY_VARIANTS.map((v) => v.id);
  for (const id of [
    "51798394929385",
    "51798261825769",
    "51798264447209",
    "51798268575977",
    "51798277882089",
  ]) {
    assert.ok(ids.includes(id), id);
  }
});

test("variantById resolves each id and unknown returns null", () => {
  assert.equal(variantById("51798261825769").plan, "hooking-up");
  assert.equal(variantById("51798268575977").role, "host");
  assert.equal(variantById("51798268575977").tier, "moving-in");
  assert.equal(variantById("999"), null);
  assert.equal(variantById("000"), null);
});

test("mapShopifyLineItems picks the most valuable plan", () => {
  const items = [
    { variant_id: "51798261825769" },
    { variant_id: "51798268575977" },
  ];
  assert.equal(mapShopifyLineItems(items).plan, "moving-in");
  assert.equal(mapShopifyLineItems(items).role, "host");
  assert.equal(mapShopifyLineItems([{ variant_id: "51798264447209" }]).annual, true);
});

test("mapShopifyLineItems falls back to flirting with no/unknown items", () => {
  assert.equal(mapShopifyLineItems([]).plan, "flirting");
  assert.equal(mapShopifyLineItems([{ variant_id: "wat" }]).plan, "flirting");
});

test("computeExpiresAt adds duration days", () => {
  const from = new Date("2025-01-01T00:00:00Z");
  const out = computeExpiresAt(variantById("51798261825769"), from);
  assert.equal(out.toISOString(), "2025-01-31T00:00:00.000Z");
  assert.equal(computeExpiresAt(variantById("51798394929385"), from), null);
});

test("buildSubscriptionDoc maps anniversary/anual and expiry", () => {
  const monthly = buildSubscriptionDoc({
    variant: variantById("51798261825769"),
    expiresAt: new Date("2025-02-01"),
    customerId: "c1",
    orderId: "o1",
  });
  assert.equal(monthly.provider, "shopify");
  assert.equal(monthly.status, "active");
  assert.equal(monthly.plan, "monthly");
  assert.equal(monthly.tier, "hooking-up");
  assert.equal(monthly.role, "member");
  assert.equal(monthly.shopifyCustomerId, "c1");
  assert.equal(monthly.currentPeriodEnd.toISOString(), "2025-02-01T00:00:00.000Z");

  const annual = buildSubscriptionDoc({ variant: variantById("51798277882089") });
  assert.equal(annual.plan, "annual");
  assert.equal(annual.tier, "moving-in");
  assert.equal(annual.role, "host");
  assert.equal(annual.currentPeriodEnd, undefined);
});

test("shouldGrantMembership: orders/paid always counts as paid", () => {
  assert.equal(shouldGrantMembership({ topic: "orders/paid", data: {} }), true);
  assert.equal(
    shouldGrantMembership({ topic: "orders/paid", data: { financial_status: "paid" } }),
    true
  );
  assert.equal(
    shouldGrantMembership({ topic: "orders/paid", data: { financial_status: "partially_refunded" } }),
    true
  );
  assert.equal(
    shouldGrantMembership({ topic: "orders/paid", data: { financial_status: "pending" } }),
    false
  );
  assert.equal(
    shouldGrantMembership({ topic: "orders/paid", data: { financial_status: "voided" } }),
    false
  );
});

test("shouldGrantMembership: orders/create only grants once paid", () => {
  assert.equal(
    shouldGrantMembership({ topic: "orders/create", data: { financial_status: "paid" } }),
    true
  );
  assert.equal(shouldGrantMembership({ topic: "orders/create", data: {} }), false);
  assert.equal(
    shouldGrantMembership({ topic: "orders/create", data: { financial_status: "pending" } }),
    false
  );
  assert.equal(
    shouldGrantMembership({ topic: "orders/create", data: { financial_status: "voided" } }),
    false
  );
});

test("shouldGrantMembership: unrelated topics never grant", () => {
  assert.equal(shouldGrantMembership({ topic: "orders/cancelled" }), false);
  assert.equal(shouldGrantMembership({ topic: "orders/fulfilled" }), false);
  assert.equal(shouldGrantMembership({ topic: "refunds/create" }), false);
  assert.equal(shouldGrantMembership({ topic: "", data: { financial_status: "paid" } }), false);
});

// ------------------------- a purchase may raise a tier, never lower it (fix 2)

test("a lower-tier purchase is refused while the member holds a higher active tier", () => {
  // The bug: writing variant.tier unconditionally silently demoted a Moving In
  // member who bought Hooking Up, taking their hosting and Diamond badge while
  // they were still paying.
  assert.equal(
    mayWriteTier({ currentTier: "moving-in", currentIsActive: true, incomingTier: "hooking-up" }),
    false
  );
  assert.equal(
    mayWriteTier({ currentTier: "moving-in", currentIsActive: true, incomingTier: "flirting" }),
    false
  );
  assert.equal(
    mayWriteTier({ currentTier: "hooking-up", currentIsActive: true, incomingTier: "flirting" }),
    false
  );
});

test("a same-tier or higher purchase is always written", () => {
  // A renewal of the same plan, and any genuine upgrade, must go through.
  assert.equal(
    mayWriteTier({ currentTier: "hooking-up", currentIsActive: true, incomingTier: "hooking-up" }),
    true
  );
  assert.equal(
    mayWriteTier({ currentTier: "flirting", currentIsActive: true, incomingTier: "hooking-up" }),
    true
  );
  assert.equal(
    mayWriteTier({ currentTier: "flirting", currentIsActive: true, incomingTier: "moving-in" }),
    true
  );
  assert.equal(
    mayWriteTier({ currentTier: "hooking-up", currentIsActive: true, incomingTier: "moving-in" }),
    true
  );
});

test("a lapsed higher tier is not protected", () => {
  // Expiry matters as much as rank: once Moving In has lapsed, re-subscribing at
  // a lower tier is a legitimate purchase, not a downgrade to block.
  assert.equal(
    mayWriteTier({ currentTier: "moving-in", currentIsActive: false, incomingTier: "flirting" }),
    true
  );
  assert.equal(
    mayWriteTier({ currentTier: "moving-in", currentIsActive: false, incomingTier: "hooking-up" }),
    true
  );
});

test("a member with no subscription is granted whatever they bought", () => {
  for (const incomingTier of ["flirting", "hooking-up", "moving-in"]) {
    assert.equal(
      mayWriteTier({ currentTier: undefined, currentIsActive: false, incomingTier }),
      true,
      `first purchase of ${incomingTier} was blocked`
    );
  }
});

test("an unrecognised tier on either side fails open", () => {
  // Not evidence of a downgrade, so the purchase is written rather than
  // stranding a paying customer on a row we cannot rank.
  assert.equal(
    mayWriteTier({ currentTier: "premium", currentIsActive: true, incomingTier: "flirting" }),
    true
  );
  assert.equal(
    mayWriteTier({ currentTier: "moving-in", currentIsActive: true, incomingTier: "premium" }),
    true
  );
});

// ------------------------------- a refund gives back the purchase, not the
// role (fix 3)

test("a refund never strips a hand-assigned staff role", () => {
  // The bug: revokeAccess wrote role: "member" unconditionally, so a refund
  // demoted an owner or moderator and locked them out of the community.
  assert.equal(roleAfterRevoke("owner"), "owner");
  assert.equal(roleAfterRevoke("moderator"), "moderator");
});

test("a refund does give back the host role, which the purchase granted", () => {
  assert.equal(roleAfterRevoke("host"), "member");
  assert.equal(roleAfterRevoke("member"), "member");
});

test("a refund normalises anything that is not staff", () => {
  for (const role of [null, undefined, "", "guest", "co-host", "Owner "]) {
    const kept = roleAfterRevoke(role);
    assert.ok(
      kept === "member" || kept === role,
      `unexpected role ${JSON.stringify(kept)} for ${JSON.stringify(role)}`
    );
  }
  assert.equal(roleAfterRevoke("co-host"), "member");
});

test("roleAfterRevoke is case tolerant on the way in", () => {
  // Staff detection must not depend on the exact casing stored on the row, or
  // an "Owner" row would still be demoted.
  assert.equal(roleAfterRevoke("Owner"), "Owner");
  assert.equal(roleAfterRevoke("MODERATOR"), "MODERATOR");
});