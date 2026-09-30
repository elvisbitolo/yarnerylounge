// Resolves a member's live capabilities from their subscription document.
//
// The matrix and its predicates live in capabilities-core.js, which is
// alias-free and unit-tested on its own; see the drift test in
// __tests__/tier-resolution.test.js for why that split matters.
import { getAccessSub, isActiveSub, isStaff } from "@/lib/server/subscription";
import { periodEndMillis } from "@/lib/server/billing";
import { tierForRole } from "@/lib/server/plans";
import { cache } from "react";
// A bare `export { X } from` is a re-export only: it does not bind X in this
// module's scope. getCapabilities below reads CAPABILITIES directly, so it
// also needs a real import or every call throws "CAPABILITIES is not defined".
import { CAPABILITIES } from "./capabilities-core.js";

export {
  CAPABILITIES,
  canBuildNeighborhoods,
  canHost,
  canJoinLounge,
  canJoinNeighborhoods,
  canPublishRemote,
  canUseMatchmaker,
  canWriteChat,
} from "./capabilities-core.js";

export const getCapabilities = cache(async function getCapabilities(uid) {
  const sub = await getAccessSub(uid);
  const active = isActiveSub(sub);
  if (!active) return { ...CAPABILITIES.free };
  if (isStaff({ role: sub?.role }) || sub?.isStaffAccess) {
    return { ...CAPABILITIES.host };
  }

  const tier = sub?.tier || "flirting";
  const planName = (sub?.planName || sub?.plan || tier).toLowerCase();

  // The Shopify plan is authoritative. Staff-style host access is granted for
  // the Moving In tier/plan or a top-tier role (owner/moderator/host), which
  // membership.js resolves through the same tierForRole table.
  const isMovingIn =
    tier === "moving-in" || planName === "moving-in" || tierForRole(sub?.role) === "moving-in";
  if (isMovingIn) {
    return { ...CAPABILITIES.host };
  }

  // Flirting (free $0 taster) and the free-access fallback are view-only.
  const isFreeAccess = sub?.isFreeAccess || tier === "flirting";
  if (isFreeAccess) {
    // A real paid plan name overrides a stale/missing "flirting" tier so paying
    // members are never demoted to view-only chat/video.
    const paidPlanName = planName === "hooking-up" || planName === "moving-in";
    if (!paidPlanName) return { ...CAPABILITIES.free };
  }

  // Any real paid plan (or a valid billing period) ranks as paid.
  if (planName === "hooking-up" || tier === "hooking-up" || periodEndMillis(sub) > 0) {
    return { ...CAPABILITIES.paid };
  }
  return { ...CAPABILITIES.free };
});
