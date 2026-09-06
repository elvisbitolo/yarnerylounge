import { test } from "node:test";
import assert from "node:assert/strict";
import {
  monthlyRateCents,
  summarizeSubscriptions,
  summarizePurchases,
  rankTopPosts,
} from "../analytics-core.js";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

function dateDaysAgo(days) {
  return new Date(now - days * day);
}

test("monthlyRateCents: monthly plan uses unit amount", () => {
  assert.equal(monthlyRateCents({ unitAmountCents: 2000, interval: "month" }), 2000);
});

test("monthlyRateCents: yearly plan is divided by 12", () => {
  assert.equal(monthlyRateCents({ unitAmountCents: 24000, interval: "year" }), 2000);
});

test("monthlyRateCents: missing price yields zero", () => {
  assert.equal(monthlyRateCents(null), 0);
});

test("summarizeSubscriptions: counts active and breaks down by tier/plan", () => {
  const priceMap = {
    p_std_month: { unitAmountCents: 2000, interval: "month" },
    p_prem_year: { unitAmountCents: 24000, interval: "year" },
  };
  const subs = [
    { status: "active", tier: "standard", plan: "monthly", priceId: "p_std_month", currentPeriodEnd: dateDaysAgo(-10) },
    { status: "trialing", tier: "premium", plan: "yearly", priceId: "p_prem_year", currentPeriodEnd: dateDaysAgo(-20) },
    { status: "active", tier: "standard", plan: "yearly", priceId: "p_prem_year", currentPeriodEnd: dateDaysAgo(-5), cancelAtPeriodEnd: true },
    { status: "canceled", tier: "standard", plan: "monthly", priceId: "p_std_month", currentPeriodEnd: dateDaysAgo(-5) },
    { status: "active", tier: "standard", plan: "monthly", priceId: "p_std_month", currentPeriodEnd: dateDaysAgo(2) },
  ];
  const result = summarizeSubscriptions(subs, priceMap, now);
  assert.equal(result.total, 5);
  assert.equal(result.active, 3);
  assert.equal(result.cancelAtPeriodEnd, 1);
  assert.deepEqual(result.byTier, { flirting: 4, "hooking-up": 1 });
  assert.deepEqual(result.byPlan, { monthly: 3, yearly: 2 });
  assert.deepEqual(result.byStatus, { active: 3, trialing: 1, canceled: 1 });
  assert.equal(result.estimatedMonthlyCents, 2000 + 2000 + 2000);
});

test("summarizeSubscriptions: expired subscription is not active", () => {
  const sub = { status: "active", priceId: "p", currentPeriodEnd: dateDaysAgo(3) };
  const result = summarizeSubscriptions([sub], {}, now);
  assert.equal(result.active, 0);
  assert.equal(result.estimatedMonthlyCents, 0);
});

test("summarizePurchases: sums revenue and groups by type", () => {
  const purchases = [
    { targetType: "course", priceCents: 4900 },
    { targetType: "course", priceCents: 4900 },
    { targetType: "event", priceCents: 1500 },
    { targetType: "space", priceCents: 0 },
    { targetType: "space", priceCents: null },
  ];
  const result = summarizePurchases(purchases);
  assert.equal(result.total, 5);
  assert.equal(result.revenueCents, 11300);
  assert.deepEqual(result.byType, { course: 2, event: 1, space: 2 });
  assert.equal(result.withUnknownPrice, 1);
});

test("rankTopPosts: ranks by likes + comments and filters zero-score", () => {
  const posts = [
    { id: "a", text: "alpha", authorName: "A", likes: { u1: true, u2: true }, commentCount: 1 },
    { id: "b", text: "beta", authorName: "B", likes: {}, commentCount: 0 },
    { id: "c", text: "gamma", authorName: "C", likes: { u1: true }, commentCount: 5 },
  ];
  const result = rankTopPosts(posts);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "c");
  assert.equal(result[1].id, "a");
  assert.equal(result[0].score, 6);
});
