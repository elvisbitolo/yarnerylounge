// Pure mapping helpers for the subscription storage cutover — no I/O so they
// can be unit tested with node:test. See subscription.js for the storage layer.

// Maps a Postgres subscription row (Prisma) into the shape billing/capability
// logic expects, so that logic stays storage-agnostic.
export function mapSubscriptionRow(row) {
  if (!row) return null;
  return {
    provider: row.provider || "",
    status: row.status || "",
    tier: row.tier || "",
    plan: row.plan || "",
    planName: row.planName || "",
    role: row.role || "",
    priceId: row.priceId || "",
    currentPeriodStart: row.currentPeriodStart || null,
    currentPeriodEnd: row.currentPeriodEnd || null,
    trialStart: row.trialStart || null,
    trialEnd: row.trialEnd || null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? null,
    canceledAt: row.canceledAt || null,
    shopifyCustomerId: row.shopifyCustomerId || "",
    shopifyOrderId: row.shopifyOrderId || "",
  };
}

// True for a subscription row written by the emergency open-access override
// rather than by a purchase. Such a row carries no priceId and no
// shopifyCustomerId, and it records only that the member once signed up while
// the override was switched on.
export function isOpenAccessRow(sub) {
  return sub?.provider === "open-access";
}

// Decides whether a stored subscription is allowed to govern access. Returns
// null when it is not, so the caller falls back to the free tier.
//
// The override writes a permanent-looking row (provider "open-access", tier
// "moving-in") when a member signs up while it is on. Left alone, that row
// keeps granting the top tier after the override is switched off, so every
// member who joined during an open-access period stays on Moving In forever
// and the tiers never actually apply. Open access is applied at read time from
// the env var, so ignoring the row here costs nothing: with the override on,
// the caller has already returned the top tier before reaching this.
export function effectiveSubscription(sub) {
  if (!sub) return null;
  if (isOpenAccessRow(sub)) return null;
  return sub;
}