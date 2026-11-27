import { test } from "node:test";
import assert from "node:assert/strict";
import {
  purchaseKey,
  isPurchasable,
  canAccessPaid,
  verifyPurchaseAmount,
} from "../purchases-core.js";

test("purchaseKey: joins type and id", () => {
  assert.equal(purchaseKey("course", "abc"), "course:abc");
});

test("isPurchasable: only positive prices are purchasable", () => {
  assert.equal(isPurchasable({ purchasePriceCents: 4900 }), true);
  assert.equal(isPurchasable({ purchasePriceCents: 0 }), false);
  assert.equal(isPurchasable({}), false);
  assert.equal(isPurchasable(null), false);
});

test("canAccessPaid: free items are always accessible", () => {
  assert.equal(canAccessPaid("course", { id: "a", purchasePriceCents: 0 }, new Set()), true);
  assert.equal(canAccessPaid("course", { id: "a" }, undefined), true);
});

test("canAccessPaid: paid items require the matching type and id key", () => {
  const item = { id: "a", purchasePriceCents: 4900 };
  assert.equal(canAccessPaid("course", item, new Set(["course:a"])), true);
  assert.equal(canAccessPaid("course", item, new Set()), false);
  assert.equal(canAccessPaid("course", item, undefined), false);
  assert.equal(canAccessPaid("course", item, new Set(["course:b"])), false);
  assert.equal(canAccessPaid("event", item, new Set(["course:a"])), false);
  assert.equal(canAccessPaid("event", item, new Set(["event:a"])), true);
});

test("canAccessPaid: a paid item without an id or a usable key set is denied", () => {
  const item = { purchasePriceCents: 4900 };
  assert.equal(canAccessPaid("course", item, new Set(["course:undefined"])), false);
  assert.equal(canAccessPaid("course", { id: "a", purchasePriceCents: 4900 }, {}), false);
});

test("verifyPurchaseAmount: accepts exact match", () => {
  assert.deepEqual(verifyPurchaseAmount(4900, 4900), { ok: true, reason: "" });
});

test("verifyPurchaseAmount: rejects mismatch", () => {
  const result = verifyPurchaseAmount(4900, 4999);
  assert.equal(result.ok, false);
  assert.match(result.reason, /mismatch/i);
});

test("verifyPurchaseAmount: rejects non-purchasable items", () => {
  assert.equal(verifyPurchaseAmount(0, 0).ok, false);
});

test("verifyPurchaseAmount: rejects invalid amounts", () => {
  assert.equal(verifyPurchaseAmount(NaN, 4900).ok, false);
});
