import { isPaidTier } from "./plans.js";

export const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

export function toMillis(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function periodEndMillis(sub) {
  const current = toMillis(sub?.currentPeriodEnd);
  const trial = toMillis(sub?.trialEnd);
  return Math.max(current, trial);
}

export function isActiveSub(sub, now = Date.now()) {
  if (!sub) return false;
  if (!ACTIVE_STATUSES.includes(sub.status)) return false;
  const end = periodEndMillis(sub);
  return end === 0 || end > now;
}

export function effectiveExpiryMillis(sub, userDoc) {
  const subEnd = periodEndMillis(sub);
  if (subEnd > 0) return subEnd;
  return toMillis(userDoc?.expiresAt);
}

export function isPaidUserRecordActive(userDoc, now = Date.now()) {
  if (!userDoc) return false;
  if (isPaidTier(userDoc.plan) !== true) return false;
  const status = String(userDoc.paymentStatus || "").toLowerCase();
  if (status === "cancelled" || status === "refunded") return false;
  const end = toMillis(userDoc.expiresAt);
  return end === 0 || end > now;
}

export function isAccessExpired(sub, userDoc, now = Date.now()) {
  const end = effectiveExpiryMillis(sub, userDoc);
  return end > 0 && end <= now;
}

export function subscriptionStatus(sub, now = Date.now()) {
  if (!sub) return "none";
  if (sub.status === "canceled" || sub.canceledAt) return "canceled";
  if (sub.status === "paused") return "paused";
  if (sub.status === "incomplete") return "incomplete";
  if (sub.status === "past_due") {
    return isActiveSub(sub, now) ? "past_due" : "inactive";
  }
  if (sub.status === "trialing" && isActiveSub(sub, now)) return "trialing";
  if (sub.status === "active") {
    if (!isActiveSub(sub, now)) return "inactive";
    return sub.cancelAtPeriodEnd ? "cancel_at_period_end" : "active";
  }
  return "inactive";
}
