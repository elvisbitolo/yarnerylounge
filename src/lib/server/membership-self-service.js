import { LEGACY_ALIASES, TIERS, displayTier, tierRank } from "./plans.js";
import { effectiveExpiryMillis, subscriptionStatus } from "./billing.js";
import { effectiveSubscription } from "./subscription-core.js";

export function normalizeMembershipPlan(value) {
  const key = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  const plan = LEGACY_ALIASES[key] || key;
  return TIERS.includes(plan) ? plan : null;
}

export function canSelfManageMembership(role) {
  const current = String(role ?? "").trim().toLowerCase();
  return current !== "owner" && current !== "moderator";
}

export function billingTier(userDoc, sub, now = Date.now()) {
  const effectiveSub = effectiveSubscription(sub);
  const status = subscriptionStatus(effectiveSub, now);
  const rawTier =
    effectiveSub?.tier ||
    effectiveSub?.planName ||
    effectiveSub?.plan ||
    userDoc?.plan;
  const tier = displayTier(rawTier, null);
  if (["canceled", "inactive", "paused", "incomplete"].includes(status)) {
    return "flirting";
  }
  const expiry = effectiveExpiryMillis(effectiveSub, userDoc);
  if (expiry > 0 && expiry <= now) return "flirting";
  return tier;
}

export function selfServicePlanAction(currentTier, targetTier) {
  const current = normalizeMembershipPlan(currentTier);
  const target = normalizeMembershipPlan(targetTier);
  if (!current || !target) return "unavailable";
  if (current === target) return "current";
  if (target === "flirting") return "cancel";
  if (tierRank(target) > tierRank(current)) return "upgrade";
  if (tierRank(target) < tierRank(current)) return "downgrade";
  return "unavailable";
}
