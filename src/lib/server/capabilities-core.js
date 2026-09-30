// The membership permission matrix and its predicates, with no database or
// environment access.
//
// Split out of capabilities.js so the matrix can be unit-tested directly: the
// test runner resolves bare specifiers only, and capabilities.js reaches
// subscription.js, which uses the "@/..." path alias. Keeping the matrix here
// alias-free is what lets the tier-drift test import it.
//
// This mirrors the tiers as sold on the shop page, which is the spec:
//   Flirting   -> front parlor. Profile, calendar, share work, browse the feed.
//                 No video lounges at all.
//   Hooking Up -> + the 24/7 video lounges, chat, the Daily Match, join groups.
//   Moving In  -> + host privileges, neighbourhood building, the Diamond badge.
//
//   free  -> Flirting  (no lounges, read-only chat, no matchmaker, no hosting, no neighborhoods)
//   paid  -> Hooking Up + Moving In  (full video/audio, read+write chat, matchmaker, join neighborhoods)
//   host  -> Moving In  (create & name rooms, build sub-groups / neighborhoods)
export const CAPABILITIES = {
  free: {
    key: "flirting",
    label: "Flirting",
    // canJoin is false, not muted: the shop page lists video lounges as a
    // Hooking Up perk and Flirting as front-parlor access only, so a free
    // member is refused entry rather than seated in a silent room. It was
    // briefly true as a free-access fallback, which let anyone watch muted.
    video: { canJoin: false, canPublish: false, muted: true },
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

// Fail closed everywhere. A missing or partial caps object must never grant a
// capability: an undefined check would hand camera rights to any caller whose
// caps failed to load.
export function canPublishRemote(caps) {
  return caps?.video?.canPublish === true;
}

// Whether the member may enter a video lounge at all. This is the paywall
// check: Flirting is refused, both paid tiers are admitted. Kept separate from
// canPublishRemote because "may be in the room" and "may go live in it" are
// different questions.
export function canJoinLounge(caps) {
  return caps?.video?.canJoin === true;
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
