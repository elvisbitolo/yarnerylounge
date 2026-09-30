// Relative imports rather than the "@/..." alias: the test runner resolves bare
// specifiers only, and this module is covered directly by
// __tests__/tier-resolution.test.js. All three targets live in this directory.
import { CAPABILITIES } from "./capabilities-core.js";
import { isOpenAccess, openAccessPlan } from "./access-policy.js";
import { tierForRole } from "./plans.js";
import { toMillis } from "./user-core.js";

const PAID_PLANS = new Set(["hooking-up", "moving-in"]);

// Derives a cheap, read-efficient membership snapshot from the user doc only.
// This mirrors getAccessSub/getCapabilities (subscription doc) with a single
// read, so global providers/badges never fan out queries per component.
export function deriveMembership(userDoc, now = Date.now()) {
  const plan = userDoc?.plan || "flirting";
  const role = userDoc?.role || "member";

  const expiresAtMs = toMillis(userDoc?.expiresAt);
  const paidPlan = PAID_PLANS.has(plan);
  const expired = paidPlan && expiresAtMs > 0 && expiresAtMs < now;

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
  else if (userDoc && isOpenAccess()) planKey = openAccessPlan();
  else if (!expired && plan === "moving-in") planKey = "moving-in";
  else if (!expired && plan === "hooking-up") planKey = "hooking-up";

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