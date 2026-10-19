// Pure rules for the member "Notify me" watch (Block/Mute/Notify row in the
// /members hover tooltip). Everything here is side-effect free so the cooldown
// and eligibility decisions are unit-testable; the Prisma fan-out lives in
// member-watch.js.

// How long a watcher stays quiet about one trigger. Presence heartbeats are
// rate-limited to 6/min and the online window is 2 minutes, so a member who
// flaps offline/online would otherwise earn a notification every couple of
// minutes. Ten minutes matches the lounge-live broadcast cooldown, and still
// lets a "they came back" alert through on a normal return.
export const WATCH_ONLINE_COOLDOWN_MS = 10 * 60_000;

// Same window for lounge re-entry: it is what stops a page refresh (which
// re-sends "join" on mount) from announcing the member a second time.
export const WATCH_ROOM_COOLDOWN_MS = 10 * 60_000;

export function canWatch(watcherId, targetId) {
  return Boolean(watcherId) && Boolean(targetId) && watcherId !== targetId;
}

function millisOf(value) {
  if (value == null) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// True when the pair has never been notified, or the last one is older than
// the cooldown.
export function shouldNotifyOnline({ lastOnlineNotifiedAt, now = Date.now() }) {
  const last = millisOf(lastOnlineNotifiedAt);
  if (last === null) return true;
  return now - last >= WATCH_ONLINE_COOLDOWN_MS;
}

// A different lounge always notifies (that is a new event), while re-entering
// the same lounge inside the window does not (that is a refresh).
export function shouldNotifyRoom({ lastRoomId, lastRoomNotifiedAt, roomId, now = Date.now() }) {
  if (!roomId) return false;
  if (!lastRoomId || lastRoomId !== roomId) return true;
  const last = millisOf(lastRoomNotifiedAt);
  if (last === null) return true;
  return now - last >= WATCH_ROOM_COOLDOWN_MS;
}

// Rendered by NotificationsList as <strong>{actorName}</strong> {text}, so these
// read as a sentence continuing the watched member's name.
export function onlineNotifyText() {
  return "is now online.";
}

export function roomNotifyText(roomName) {
  const name = typeof roomName === "string" && roomName.trim() ? roomName.trim() : "a lounge";
  return `joined ${name}.`;
}
