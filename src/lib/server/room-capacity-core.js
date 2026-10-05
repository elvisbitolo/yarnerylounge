// Pure capacity rules for lounge ("room") membership.
//
// The shop page sells a "guaranteed spot on the sofa", but Room.maxParticipants
// was stored and displayed and never enforced on any join path: every lounge
// accepted arbitrarily many concurrent members. This module holds the decision
// so it can be unit-tested without a database.
//
// Design rules, in priority order:
//  1. A cap of 0 or less (or missing/garbage) means unlimited.
//  2. Staff and the room's own host/co-host are never locked out of their room.
//  3. Someone already holding a place keeps it. Capacity gates *entry*; it must
//     never evict or block a heartbeat, or a full room would freeze the
//     members already inside it mid-conversation.
//  4. Otherwise the join is refused once the active headcount reaches the cap.

export function normalizeCapacity(maxParticipants) {
  const n = Number(maxParticipants);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export function evaluateJoinCapacity({
  maxParticipants,
  activeCount = 0,
  alreadyPresent = false,
  exempt = false,
} = {}) {
  const cap = normalizeCapacity(maxParticipants);
  if (cap === 0) {
    return { allowed: true, full: false, cap: 0, activeCount, reason: "unlimited" };
  }
  if (exempt) {
    return { allowed: true, full: false, cap, activeCount, reason: "staff-or-host" };
  }
  if (alreadyPresent) {
    return { allowed: true, full: false, cap, activeCount, reason: "already-present" };
  }
  const count = Number(activeCount) || 0;
  if (count < cap) {
    return { allowed: true, full: false, cap, activeCount: count, reason: "has-room" };
  }
  return {
    allowed: false,
    full: true,
    cap,
    activeCount: count,
    reason: "at-capacity",
  };
}