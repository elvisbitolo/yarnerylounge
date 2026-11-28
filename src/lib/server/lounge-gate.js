import { getCapabilities } from "@/lib/server/capabilities";
import { canUseMatchmaker, canJoinLounge } from "@/lib/server/capabilities-core";
import { isOpenAccess } from "@/lib/server/access-policy";
import { getSubscription } from "@/lib/server/subscription";
import { isMembershipExpired } from "@/lib/server/billing";

// The lounge gate decides whether a signed-in user may stay on a page.
// Returns a redirect target ("/plan-expired" or "/membership") or null to allow.
export async function loungeGate(uid, userDoc, opts = {}) {
  if (!isOpenAccess()) {
    const sub = await getSubscription(uid);
    if (isMembershipExpired(userDoc, sub)) return "/plan-expired";
  }

  if (opts.lounge || opts.matchmaker) {
    const caps = await getCapabilities(uid);
    if (opts.lounge && !canJoinLounge(caps)) return "/membership";
    if (opts.matchmaker && !canUseMatchmaker(caps)) return "/membership";
  }
  return null;
}
