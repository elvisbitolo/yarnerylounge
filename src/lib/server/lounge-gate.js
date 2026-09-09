import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { isPaidPlanExpired } from "@/lib/server/user-core";
import { isOpenAccess } from "@/lib/server/access-policy";

// The lounge gate decides whether a signed-in user may stay on a page.
// Returns a redirect target ("/plan-expired" or "/membership") or null to allow.
//
// opts.matchmaker: only users with matchmaker capability may pass, otherwise a
//   flirting/guest is sent to /membership (which redirects to the speakeasy).
// An expired paid plan is always redirected to /plan-expired — except during
// open access, where every signed-in member is admitted regardless.
export async function loungeGate(uid, userDoc, opts = {}) {
  if (!isOpenAccess() && isPaidPlanExpired(userDoc)) {
    return "/plan-expired";
  }
  if (opts.matchmaker) {
    const caps = await getCapabilities(uid);
    if (!canUseMatchmaker(caps)) return "/membership";
  }
  return null;
}