// Relative imports rather than the "@/..." alias: the test runner resolves bare
// specifiers only, and this module is covered directly by
// __tests__/tier-resolution.test.js. All three targets live in this directory.
import { CAPABILITIES } from "./capabilities-core.js";
import { isOpenAccess, openAccessPlan } from "./access-policy.js";
import { effectiveSubscription } from "./subscription-core.js";
import { effectiveExpiryMillis, isPaidTier } from "./billing.js";
import { displayTier, tierForRole } from "./plans.js";

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
  // A top-tier role wins over the plan string, so a manually granted host shows
  // the Moving In label and Diamond badge rather than "Flirting". Previously
  // only owner/moderator were honoured here while capabilities.js also honoured
  // host, which is how a host ended up with host rights and no badge.
  const roleTier = tierForRole(role);
  if (roleTier) planKey = roleTier;
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

  return {
    planKey,
    label: caps.label,
    plan,
    role,
    capabilities: caps,
    profileBadge: caps.profileBadge,
    theme: userDoc?.extra?.dashboardTheme || userDoc?.dashboardTheme || null,
  };
}

