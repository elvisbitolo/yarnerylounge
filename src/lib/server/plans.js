export const TIERS = ["flirting", "hooking-up", "moving-in"];

export const LEGACY_ALIASES = {
  lounge: "flirting",
  standard: "flirting",
  community: "flirting",
  free: "flirting",
  none: "flirting",
  plus: "hooking-up",
  premium: "hooking-up",
  creator: "hooking-up",
  paid: "hooking-up",
  host: "moving-in",
};

export const TIER_RANK = { flirting: 0, "hooking-up": 1, "moving-in": 2 };

// Roles that carry the top tier regardless of the plan string.
//
// This is the single source of truth for role -> tier. It used to be
// hand-rolled in two places (capabilities.js and membership.js) and the two
// copies drifted: capabilities.js honoured "host" while membership.js only
// knew "owner"/"moderator", so a host got full Moving In entitlements but no
// Diamond badge and a "Flirting" label. Both call this now.
//
// "co-host" is deliberately absent: it is a per-room HostAssignment role, not
// a User.role, so it must not imply global top-tier rights.
export const TIER_FOR_ROLE = {
  owner: "moving-in",
  moderator: "moving-in",
  host: "moving-in",
};

export function tierForRole(role) {
  if (!role) return null;
  return TIER_FOR_ROLE[String(role).trim().toLowerCase()] || null;
}

// One badge per tier, keyed by the canonical tier so the shape never drifts.
// `icon` is a semantic name (serializable, like the rest of this module) that
// components/TierIcon.js resolves to a lucide-react glyph on render — this
// module stays pure for the node:test runner and never imports a component.
export const TIER_BADGE = {
  flirting: { icon: "sparkles", color: "#ec4899", label: "Flirting" },
  "hooking-up": { icon: "crown", color: "#d4a017", label: "Hooking Up" },
  "moving-in": { icon: "gem", color: "#3b82f6", label: "Moving In" },
};

function normalize(tier) {
  const t = LEGACY_ALIASES[tier] || tier;
  return TIERS.includes(t) ? t : null;
}

export const TIER_INFO = {
  flirting: {
    name: "Flirting",
    shortName: "Flirting",
    handle: "The Front Parlor Pass",
    priceCents: 0,
    videoChat: { canJoin: true, canHost: false },
  },
  "hooking-up": {
    name: "Hooking Up",
    shortName: "Hooking Up",
    handle: "The Main Floor Ticket",
    priceCents: 795,
    videoChat: { canJoin: true, canHost: false },
  },
  "moving-in": {
    name: "Moving In",
    shortName: "Moving In",
    handle: "The Resident Key",
    priceCents: 1795,
    videoChat: { canJoin: true, canHost: true },
  },
};

export function tierLabel(tier) {
  return TIER_INFO[normalize(tier)]?.name || "Flirting";
}

export function tierShortLabel(tier) {
  return TIER_INFO[normalize(tier)]?.shortName || "Flirting";
}

export function tierBadge(tier) {
  return TIER_BADGE[normalize(tier)] || null;
}

export function tierRank(tier) {
  return TIER_RANK[normalize(tier)] ?? -1;
}

export function meetsTier(userTier, requiredTier) {
  if (requiredTier == null || requiredTier === "") return true;
  const req = normalize(requiredTier);
  if (!req || req === "flirting") return true;
  return tierRank(userTier) >= tierRank(req);
}

export function videoChatRights(tier) {
  return TIER_INFO[normalize(tier)]?.videoChat || TIER_INFO.flirting.videoChat;
}

export function isAtLeast(userTier, requiredTier) {
  return meetsTier(userTier, requiredTier);
}