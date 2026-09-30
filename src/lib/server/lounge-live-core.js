// Pure helpers for the "Christa is live" lounge broadcast.
//
// Kept free of Prisma and network imports so the rules that decide *whether*
// to announce, and *what* to say, are testable on their own. See
// ./lounge-live.js for the fan-out that uses these.

// The only account whose joins are announced. Deliberately an exact email
// match rather than `role = "owner"`: five users carry that role, and the
// owner asked for announcements about herself, not about whoever holds the
// title next quarter. Override for local testing.
export const LIVE_ANNOUNCER_EMAIL =
  process.env.LOUNGE_LIVE_ANNOUNCER_EMAIL || "secretyarnery@gmail.com";

// How the announcement is worded, per room. "Christa" is her spoken name in
// the community; the account's display name is not reliably that.
export const LIVE_ANNOUNCER_NAME = "Christa";

// Dedupe window, keyed on the (announcer, room) pair.
//
// Ten minutes is long enough to swallow page refreshes, a flaky reconnect and
// a second browser tab, and short enough that a genuine return to the same
// lounge later in the day still reaches people. Keyed on the pair rather than
// the person so that moving between the four always-on lounges is a genuine
// announcement each time — which is the behaviour that was asked for.
export const LIVE_COOLDOWN_MS = 10 * 60 * 1000;

// How recently presence must have been seen for the join to count as a
// reconnect rather than an arrival. Slightly longer than the 90s presence
// heartbeat so a single missed beat does not re-announce her.
export const LIVE_PRESENCE_GRACE_MS = 2 * 60 * 1000;

/** Master switch, so a 2am misfire needs an env var and not a rollback. */
export function isLoungeLiveEnabled() {
  return process.env.LOUNGE_LIVE_NOTIFY !== "off";
}

/** Whether this joining account is the one we announce. */
export function isLiveAnnouncer(user) {
  if (!user) return false;
  const email = String(user.email || "").trim().toLowerCase();
  return Boolean(email) && email === LIVE_ANNOUNCER_EMAIL;
}

/** "Christa is live in Happy Hour Hub" */
export function buildLiveMessage(roomName) {
  const room = String(roomName || "").trim();
  const name = room || "a lounge";
  return `${LIVE_ANNOUNCER_NAME} is live in ${name}`;
}

export function buildLiveEmail({ roomName, roomSlug, appUrl }) {
  const room = String(roomName || "").trim() || "a lounge";
  const base = String(appUrl || "").replace(/\/+$/, "");
  const link = base && roomSlug ? `${base}/rooms/${roomSlug}` : base;
  return {
    subject: `${LIVE_ANNOUNCER_NAME} is live in ${room}`,
    text:
      `${LIVE_ANNOUNCER_NAME} just joined ${room} and is live now.\n\n` +
      (link ? `Join her: ${link}\n\n` : "") +
      // Names the opt-out rather than leaving members to wonder why they are
      // being emailed. There is no per-address unsubscribe at this volume.
      "You are receiving this because you are a member of the community. " +
      "Turn off lounge announcements under Account > Notifications.",
  };
}

/**
 * Decide whether this join should be announced, and to whom.
 *
 * `recentJoin` is an existing RoomEvent for the same (user, room) inside the
 * cooldown window; `wasRecentlyPresent` is whether presence showed her in this
 * room moments before the join request. Either one means this is a refresh
 * rather than an arrival, and announcing it would train members to ignore the
 * notification.
 */
export function shouldAnnounce({
  enabled = true,
  announcer = false,
  roomName = "",
  recentJoin = false,
  wasRecentlyPresent = false,
  cooldownMs = LIVE_COOLDOWN_MS,
}) {
  if (!enabled) return { announce: false, reason: "disabled" };
  if (!announcer) return { announce: false, reason: "not_announcer" };
  if (!String(roomName || "").trim()) return { announce: false, reason: "no_room" };
  if (wasRecentlyPresent) return { announce: false, reason: "already_present" };
  if (recentJoin) return { announce: false, reason: "cooldown", cooldownMs };
  return { announce: true, reason: "live" };
}

/**
 * Pick the room to feature in the "Christa is live" card.
 *
 * Returns null when she is not in a room, when the room is gone, or when more
 * than one live row survives — a second tab or a missed `leave` would
 * otherwise leave the card pointing at an arbitrary room and inviting people
 * into an empty one.
 */
export function pickAnnouncerRoom(rows, { ownerEmail = LIVE_ANNOUNCER_EMAIL } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const wanted = String(ownerEmail).trim().toLowerCase();

  const candidates = rows.filter(
    (row) =>
      String(row?.user?.email || "").trim().toLowerCase() === wanted &&
      row?.room &&
      row.room.status !== "deleted"
  );
  if (candidates.length !== 1) return null;
  return candidates[0].room;
}

/**
 * Recipients for the broadcast: every active member except the announcer.
 *
 * Suspended members are excluded. Deliberately *not* filtered on
 * `paymentStatus`, because 37 of the 38 accounts have it NULL and using it
 * would silently exclude almost everyone.
 */
export function selectRecipients(users, announcerId) {
  if (!Array.isArray(users)) return [];
  const seen = new Set();
  const out = [];
  for (const user of users) {
    const id = user?.id;
    if (!id || id === announcerId) continue;
    if (user.suspended === true) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(user);
  }
  return out;
}
