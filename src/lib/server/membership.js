// Relative imports rather than the "@/..." alias: the test runner resolves bare
// specifiers only, and this module is covered directly by
// __tests__/tier-resolution.test.js. All three targets live in this directory.
import { CAPABILITIES } from "./capabilities-core.js";
import { isOpenAccess, openAccessPlan } from "./access-policy.js";
import { effectiveSubscription } from "./subscription-core.js";
import { effectiveExpiryMillis } from "./billing.js";
import { displayTier, isPaidTier, meetsTier, tierForRole } from "./plans.js";

// Derives a cheap, read-efficient membership snapshot from the user doc only.
// This mirrors getAccessSub/getCapabilities (subscription doc) with a single
// read, so global providers/badges never fan out queries per component.
export function deriveMembership(userDoc, now = Date.now(), sub = null) {
  const plan = userDoc?.plan || "flirting";
  const role = userDoc?.role || "member";

  const effectiveSub = effectiveSubscription(sub);
  const hasSubRow = sub != null;
  const planSource = hasSubRow
    ? effectiveSub?.tier || effectiveSub?.planName || effectiveSub?.plan
    : plan;
  const canonicalPlan = displayTier(planSource, null);
  const expiresAtMs = effectiveExpiryMillis(effectiveSub, userDoc);
  const paidPlan = isPaidTier(canonicalPlan);
  const expired = paidPlan && expiresAtMs > 0 && expiresAtMs < now;
  const explicitlyCanceled =
    userDoc?.paymentStatus === "cancelled" ||
    userDoc?.paymentStatus === "refunded" ||
    effectiveSub?.status === "canceled" ||
    Boolean(effectiveSub?.canceledAt);

  let planKey = "flirting";
  // Staff roles are independent of billing and always keep the top tier.
  const staffTier = role === "owner" || role === "moderator" ? tierForRole(role) : null;
  // A manually granted host role wins over the plan string, but an expired or
  // canceled paid membership does not — Shopify writes role "host" to the user
  // on purchase and never clears it, so letting the role win here left expired
  // members showing Moving In even though the server gates already denied them.
  const roleTier = tierForRole(role);
  if (staffTier) planKey = staffTier;
  else if (!expired && !explicitlyCanceled && roleTier) planKey = roleTier;
  // Open-access mode: every signed-in member is admitted at the top tier until
  // the gate is flipped on — mirrors getAccessSub so badges/CTAs match the
  // server capability grants (no upgrade prompts while the community ramps up).
  else if (!explicitlyCanceled && userDoc && isOpenAccess()) planKey = openAccessPlan();
  else if (!explicitlyCanceled && !expired && canonicalPlan !== "flirting") planKey = canonicalPlan;

  const caps =
    planKey === "moving-in"
      ? CAPABILITIES.host
      : planKey === "hooking-up"
        ? CAPABILITIES.paid
        : CAPABILITIES.free;

  const isExpired = paidPlan && (expired || explicitlyCanceled) && !staffTier;

  return {
    planKey,
    isExpired,
    label: caps.label,
    plan,
    role,
    capabilities: caps,
    profileBadge: caps.profileBadge,
    theme: userDoc?.extra?.dashboardTheme || userDoc?.dashboardTheme || null,
  };
}

export function meetsAccessTier(userDoc, sub, requiredTier, now = Date.now()) {
  if (!requiredTier) return true;
  return meetsTier(deriveMembership(userDoc, now, sub).planKey, requiredTier);
}

