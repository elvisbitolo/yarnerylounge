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

export const TIER_BADGE = {
  "hooking-up": { icon: "👑", color: "#d4a017", label: "Hooking Up" },
  "moving-in": { icon: "💎", color: "#3b82f6", label: "Moving In" },
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