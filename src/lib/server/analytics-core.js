import { isActiveSub } from "./billing.js";
import { LEGACY_ALIASES } from "./plans.js";

export function toMillis(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeTier(tier) {
  if (!tier) return "flirting";
  return LEGACY_ALIASES[tier] || tier;
}

export function startOfDay(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

export function visitKey(offset = 0) {
  const d = new Date(startOfDay(offset));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function monthlyRateCents(price) {
  if (!price) return 0;
  const unit = Number(price.unitAmountCents ?? price.unit_amount) || 0;
  const interval = price.interval || "";
  return interval === "year" ? Math.round(unit / 12) : unit;
}

export function summarizeSubscriptions(subs, priceMap = {}, now = Date.now()) {
  const byStatus = {};
  const byTier = {};
  const byPlan = {};
  let active = 0;
  let cancelAtPeriodEnd = 0;
  let estimatedMonthlyCents = 0;
  for (const sub of subs) {
    const status = sub.status || "unknown";
    const tier = normalizeTier(sub.tier);
    const plan = sub.plan || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
    byTier[tier] = (byTier[tier] || 0) + 1;
    byPlan[plan] = (byPlan[plan] || 0) + 1;
    if (!isActiveSub(sub, now)) continue;
    active += 1;
    if (sub.cancelAtPeriodEnd) cancelAtPeriodEnd += 1;
    estimatedMonthlyCents += monthlyRateCents(priceMap[sub.priceId]);
  }
  return {
    total: subs.length,
    active,
    cancelAtPeriodEnd,
    byStatus,
    byTier,
    byPlan,
    estimatedMonthlyCents,
  };
}

export function summarizePurchases(purchases) {
  let revenueCents = 0;
  let withUnknownPrice = 0;
  const byType = {};
  for (const p of purchases) {
    const type = p.targetType || "unknown";
    byType[type] = (byType[type] || 0) + 1;
    const price = Number(p.priceCents);
    if (price > 0) {
      revenueCents += price;
    } else if (p.priceCents === null || p.priceCents === undefined) {
      withUnknownPrice += 1;
    }
  }
  return { total: purchases.length, revenueCents, byType, withUnknownPrice };
}

export function rankTopPosts(posts) {
  return [...posts]
    .map((post) => ({
      id: post.id,
      text: (post.text || "(no text)").slice(0, 80),
      authorId: post.authorId || "",
      authorName: post.authorName || "Member",
      likeCount: Object.keys(post.likes || {}).length,
      commentCount: post.commentCount || 0,
      createdAt: toMillis(post.createdAt),
      score: Object.keys(post.likes || {}).length + Number(post.commentCount || 0),
    }))
    .filter((post) => post.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
