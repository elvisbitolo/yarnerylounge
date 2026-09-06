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
    profileBadge: null,
  },
  host: {
    key: "moving-in",
    label: "Moving In",
    video: { canJoin: true, canPublish: true, muted: false },
    chat: { read: true, write: true },
    matchmaker: true,
    hosting: true,
    neighborhoods: { join: true, build: true },
    profileBadge: "Diamond",
  },
};

export async function getCapabilities(uid) {
  const sub = await getAccessSub(uid);
  const active = isActiveSub(sub);
  if (!active) return { ...CAPABILITIES.free };
  if (isStaff({ role: sub?.role }) || sub?.isStaffAccess) {
    return { ...CAPABILITIES.host };
  }
  const tier = sub?.tier || "lounge";
  if (tier === "host" || sub?.role === "host") {
    return { ...CAPABILITIES.host };
  }
  // The Shopify plan name is authoritative. Flirting (free $0 taster) and the
  // free-access fallback are view-only; any real paid plan ranks as paid.
  const plan = sub?.planName || "";
  const paidPlan = plan === "hooking-up" || plan === "moving-in";
  const hasPeriod = periodEndMillis(sub) > 0;
  if (tier === "flirting" || sub?.isFreeAccess || (!paidPlan && !hasPeriod)) {
    return { ...CAPABILITIES.free };
  }
  return { ...CAPABILITIES.paid };
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