import { CAPABILITIES } from "@/lib/server/capabilities";
import { toMillis } from "@/lib/server/user-core";

const PAID_PLANS = new Set(["hooking-up", "moving-in"]);

// Derives a cheap, read-efficient membership snapshot from the user doc only.
// This mirrors getCapabilities (subscription doc) with a single read, so global
// providers/badges never fan out queries per component.
export function deriveMembership(userDoc, now = Date.now()) {
  const plan = userDoc?.plan || "flirting";
  const role = userDoc?.role || "member";

  const expiresAtMs = toMillis(userDoc?.expiresAt);
  const paidPlan = PAID_PLANS.has(plan);
  const expired = paidPlan && expiresAtMs > 0 && expiresAtMs < now;

  let planKey = "flirting";
  if (role === "owner" || role === "moderator") planKey = "moving-in";
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