// Client-safe single source of truth for Shopify storefront CTAs. Keep the
// upgrade URL in sync with SHOPIFY_UPGRADE_URL in src/lib/server/shopify.js.
export const UPGRADE_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";