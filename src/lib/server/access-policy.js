// Membership access policy switch.
//
// SHOPIFY_OPEN_ACCESS: while the community is still small, every member may
// enter the Speakeasy without owning a paid Shopify checkout. This keeps the
// experience "open for everyone" until there are enough paying members to turn
// the gate on. When true, the signup wall, access-sub derivation and capability
// gating all treat members as admitted. Set to "false" to restore strict
// paid-only access.
//
//   "true"  -> open access (everyone admitted, full host-level capabilities)
//   "false" -> strict access (prepaid Shopify checkout required)
export const OPEN_ACCESS_PLAN = "moving-in";

export function isOpenAccess() {
  const raw = process.env.SHOPIFY_OPEN_ACCESS;
  // Default to open while the community is still ramping up.
  if (raw == null || raw === "") return true;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function openAccessPlan() {
  return OPEN_ACCESS_PLAN;
}