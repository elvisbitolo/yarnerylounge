import { getCapabilities } from "@/lib/server/capabilities";
import { canUseMatchmaker, canJoinLounge } from "@/lib/server/capabilities-core";
import { isPaidPlanExpired } from "@/lib/server/user-core";
import { isOpenAccess } from "@/lib/server/access-policy";

// The lounge gate decides whether a signed-in user may stay on a page.
// Returns a redirect target ("/plan-expired" or "/membership") or null to allow.
//
// opts.lounge: video lounge pages (/rooms, /rooms/[slug]). These require a paid
//   tier, because the shop page sells "full access to the 24/7 video lounges" as
//   a Hooking Up perk. A Flirting member is sent to /membership to upgrade. This
//   is the page-level half; the Jitsi token route enforces the same rule server
//   side, since a redirect alone is not a paywall.
// opts.matchmaker: only users with matchmaker capability may pass, otherwise a
//   flirting/guest is sent to /membership (which redirects to the speakeasy).
// An expired paid plan is always redirected to /plan-expired — except during
// open access, where every signed-in member is admitted regardless.
export async function loungeGate(uid, userDoc, opts = {}) {
  if (!isOpenAccess() && isPaidPlanExpired(userDoc)) {
    return "/plan-expired";
  }
  if (opts.lounge || opts.matchmaker) {
    const caps = await getCapabilities(uid);
    if (opts.lounge && !canJoinLounge(caps)) return "/membership";
    if (opts.matchmaker && !canUseMatchmaker(caps)) return "/membership";
  }
  return null;
}