import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";

// The lounge gate decides whether a signed-in user may stay on a page.
// Returns a redirect target ("/plan-expired" or "/membership") or null to allow.
//
// opts.matchmaker: only users with matchmaker capability may pass, otherwise a
//   flirting/guest is sent to /membership (which redirects to the speakeasy).
// An expired paid plan is always redirected to /plan-expired.
export async function loungeGate(uid, userDoc, opts = {}) {
  const plan = userDoc?.plan || "flirting";
  const expiresAt = userDoc?.expiresAt;
  const expiresAtMs = expiresAt?.toMillis
    ? expiresAt.toMillis()
    : typeof expiresAt === "string"
      ? new Date(expiresAt).getTime()
      : NaN;
  if (plan !== "flirting" && expiresAtMs && !Number.isNaN(expiresAtMs) && expiresAtMs < Date.now()) {
    return "/plan-expired";
  }
  if (opts.matchmaker) {
    const caps = await getCapabilities(uid);
    if (!canUseMatchmaker(caps)) return "/membership";
  }
  return null;
}