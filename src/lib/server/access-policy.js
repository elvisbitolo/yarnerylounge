// Membership access policy switch.
//
// SHOPIFY_OPEN_ACCESS: an emergency override that admits every member at the
// top tier, ignoring their purchased plan. It exists so a bad paywall day can
// be opened back up from the Vercel environment without a deploy.
//
//   unset / "false"  -> strict access (the default; tiers are enforced as sold)
//   "true"           -> open access (everyone admitted at the top tier)
//
// The default is now strict. Membership tiers are enforced as sold on the shop
// page: Flirting gets the front parlor, video lounges begin at Hooking Up.
export const OPEN_ACCESS_PLAN = "moving-in";

export function isOpenAccess() {
  const raw = process.env.SHOPIFY_OPEN_ACCESS;
  // Fail closed: strict access unless the override is explicitly turned on.
  // This used to default to open, which meant every member resolved to the top
  // tier and a member who had paid nothing saw the $179.50/yr tier and its
  // Diamond badge.
  if (raw == null || raw === "") return false;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function openAccessPlan() {
  return OPEN_ACCESS_PLAN;
}