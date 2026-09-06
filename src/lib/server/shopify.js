export const SHOPIFY_VARIANTS = [
  { id: "51798394929385", plan: "flirting", role: "member", tier: "lounge", durationDays: 0, label: "Flirting", annual: false },
  { id: "51798261825769", plan: "hooking-up", role: "member", tier: "lounge", durationDays: 30, label: "Hooking Up", annual: false },
  { id: "51798264447209", plan: "hooking-up", role: "member", tier: "lounge", durationDays: 365, label: "Hooking Up", annual: true },
  { id: "51798268575977", plan: "moving-in", role: "host", tier: "host", durationDays: 30, label: "Moving In", annual: false },
  { id: "51798277882089", plan: "moving-in", role: "host", tier: "host", durationDays: 365, label: "Moving In", annual: true },
];

const RANK = { flirting: 0, "hooking-up": 1, "moving-in": 2 };

export function variantById(variantId) {
  return SHOPIFY_VARIANTS.find((v) => v.id === String(variantId)) || null;
}

// Pick the most valuable plan across all line items in the order.
export function mapShopifyLineItems(lineItems = []) {
  let best = null;
  for (const item of lineItems) {
    if (!item?.variant_id) continue;
    const variant = variantById(item.variant_id);
    if (!variant) continue;
    if (!best || RANK[variant.plan] > RANK[best.plan]) best = variant;
  }
  return best || SHOPIFY_VARIANTS[0];
}

export function computeExpiresAt(variant, from = new Date()) {
  if (!variant?.durationDays) return null;
  const date = new Date(from);
  date.setDate(date.getDate() + variant.durationDays);
  return date;
}

export function buildSubscriptionDoc({ variant, expiresAt, customerId, orderId }) {
  const doc = {
    provider: "shopify",
    status: "active",
    plan: "monthly",
    tier: variant.tier,
    planName: variant.plan,
    role: variant.role,
    shopifyCustomerId: customerId || "",
    shopifyOrderId: orderId || "",
    updatedAt: new Date(),
  };
  if (variant.annual) doc.plan = "annual";
  if (expiresAt) doc.currentPeriodEnd = expiresAt;
  return doc;
}

export const SHOPIFY_UPGRADE_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";