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
//
// The top tier's badge used to be a cool blue "#3b82f6" labelled "Moving In",
// which sat visually *below* the warmer gold crown on the cheaper tier and so
// read as a downgrade to members. The shop page advertises it as the
// "exclusive Diamond badge", so it is now a true diamond cyan and is labelled
// "Diamond". The tier itself is still called "Moving In" everywhere else -
// CAPABILITIES (capabilities-core.js) owns that name, so only this badge's
// tooltip changes.
export const TIER_BADGE = {
  flirting: { icon: "sparkles", color: "#ec4899", label: "Flirting" },
  "hooking-up": { icon: "crown", color: "#d4a017", label: "Hooking Up" },
  "moving-in": { icon: "gem", color: "#22d3ee", label: "Diamond" },
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

// The tier a badge should show for a member. A top-tier role (owner/moderator/
// host) outranks the raw plan string — the same precedence deriveMembership and
// getCapabilities use — so an owner whose user row still says plan "flirting"
// renders the Moving In glyph, not the free sparkles. Accepts legacy aliases
// and falls back to Flirting for anything unrecognised.
export function displayTier(plan, role) {
  return tierForRole(role) || normalize(plan) || "flirting";
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