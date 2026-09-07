import { getAccessSub, isActiveSub, isStaff } from "@/lib/server/subscription";
import { periodEndMillis } from "@/lib/server/billing";

// The membership permission matrix.
//   free  -> Flirting  (view-only lounges, read-only chat, no matchmaker, no hosting, no neighborhoods build)
//   paid  -> Hooking Up + Moving In  (full video/audio, read+write chat, matchmaker, join neighborhoods)
//   host  -> Moving In  (create & name rooms, build sub-groups / neighborhoods)
export const CAPABILITIES = {
  free: {
    key: "flirting",
    label: "Flirting",
    video: { canJoin: true, canPublish: false, muted: true },
    chat: { read: true, write: false },
    matchmaker: false,
    hosting: false,
    neighborhoods: { join: false, build: false },
    profileBadge: null,
  },
  paid: {
    key: "hooking-up",
    label: "Hooking Up",
    video: { canJoin: true, canPublish: true, muted: false },
    chat: { read: true, write: true },
    matchmaker: true,
    hosting: false,
    neighborhoods: { join: true, build: false },
    profileBadge: { icon: "👑", color: "#d4a017" },
  },
  host: {
    key: "moving-in",
    label: "Moving In",
    video: { canJoin: true, canPublish: true, muted: false },
    chat: { read: true, write: true },
    matchmaker: true,
    hosting: true,
    neighborhoods: { join: true, build: true },
    profileBadge: { icon: "💎", color: "#3b82f6" },
  },
};

export async function getCapabilities(uid) {
  const sub = await getAccessSub(uid);
  const active = isActiveSub(sub);
  if (!active) return { ...CAPABILITIES.free };
  if (isStaff({ role: sub?.role }) || sub?.isStaffAccess) {
    return { ...CAPABILITIES.host };
  }

  const tier = sub?.tier || "flirting";
  const planName = (sub?.planName || sub?.plan || tier).toLowerCase();

  // The Shopify plan is authoritative. Staff-style host access is granted for
  // the Moving In tier/plan or the host role.
  const isMovingIn =
    tier === "moving-in" || planName === "moving-in" || sub?.role === "host";
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
}

export function canPublishRemote(caps) {
  return caps?.video?.canPublish !== false;
}

export function canWriteChat(caps) {
  return caps?.chat?.write === true;
}

export function canUseMatchmaker(caps) {
  return caps?.matchmaker === true;
}

export function canHost(caps) {
  return caps?.hosting === true;
}

export function canBuildNeighborhoods(caps) {
  return caps?.neighborhoods?.build === true;
}

export function canJoinNeighborhoods(caps) {
  return caps?.neighborhoods?.join === true;
}