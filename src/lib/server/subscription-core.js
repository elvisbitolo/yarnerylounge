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