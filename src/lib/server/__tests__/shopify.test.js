import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHOPIFY_VARIANTS,
  variantById,
  mapShopifyLineItems,
  computeExpiresAt,
  buildSubscriptionDoc,
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