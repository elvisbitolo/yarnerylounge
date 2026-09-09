import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSubscriptionRow } from "../subscription-core.js";
import { isActiveSub } from "../billing.js";

test("mapSubscriptionRow: null stays null", () => {
  assert.equal(mapSubscriptionRow(null), null);
  assert.equal(mapSubscriptionRow(undefined), null);
});

test("mapSubscriptionRow: maps a full Postgres row to the Firestore doc shape", () => {
  const end = new Date("2026-10-01T00:00:00Z");
  const row = {
    id: "uid-1",
    userId: "uid-1",
    provider: "shopify",
    status: "active",
    tier: "hooking-up",
    plan: "monthly",
    planName: "hooking-up",
    role: "member",
    priceId: "p1",
    currentPeriodEnd: end,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    shopifyCustomerId: "c1",
    shopifyOrderId: "o1",
  };
  const sub = mapSubscriptionRow(row);
  assert.equal(sub.provider, "shopify");
  assert.equal(sub.status, "active");
  assert.equal(sub.tier, "hooking-up");
  assert.equal(sub.plan, "monthly");
  assert.equal(sub.currentPeriodEnd, end);
  assert.equal(sub.cancelAtPeriodEnd, false);
  assert.equal(sub.shopifyCustomerId, "c1");
  // The mapped shape must satisfy the existing billing logic unchanged.
  assert.equal(isActiveSub(sub), true);
});

test("mapSubscriptionRow: blank row yields blank strings, still active-shaped", () => {
  const sub = mapSubscriptionRow({});
  assert.equal(sub.status, "");
  assert.equal(sub.tier, "");
  assert.equal(sub.currentPeriodEnd, null);
  assert.equal(isActiveSub(sub), false);
});

test("mapSubscriptionRow: expired subscription is not active", () => {
  const sub = mapSubscriptionRow({
    status: "active",
    currentPeriodEnd: new Date(Date.now() - 1000 * 60 * 60 * 24),
  });
  assert.equal(isActiveSub(sub), false);
});