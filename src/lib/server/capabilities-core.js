// The membership permission matrix and its predicates, with no database or
// environment access.
//
// Split out of capabilities.js so the matrix can be unit-tested directly: the
// test runner resolves bare specifiers only, and capabilities.js reaches
// subscription.js, which uses the "@/..." path alias. Keeping the matrix here
// alias-free is what lets the tier-drift test import it.
//
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

// Fail closed everywhere. A missing or partial caps object must never grant a
// capability: an undefined check would hand camera rights to any caller whose
// caps failed to load.
export function canPublishRemote(caps) {
  return caps?.video?.canPublish === true;
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
