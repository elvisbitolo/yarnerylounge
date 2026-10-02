// Chat typing: pure helpers + a tiny in-memory store.
//
// Typing is ephemeral by design — these names never touch Postgres. The store
// is module-scoped so the thread (which owns the ephemeral broadcast channel)
// can publish, and the header/rail can subscribe without prop drilling.

export const TYPING_TTL_MS = 4000;
export const TYPING_THROTTLE_MS = 2000;

// Names of everyone else still typing, given the raw {userId, name, at} entries.
// A sender gone quiet for `ttlMs` is dropped. Order is map insertion order.
export function typingNamesFrom(entries, { uid, now = Date.now(), ttlMs = TYPING_TTL_MS } = {}) {
  const names = [];
  for (const entry of entries || []) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.userId === uid) continue;
    const at = Number(entry.at) || 0;
    if (now - at < ttlMs && typeof entry.name === "string" && entry.name) {
      names.push(entry.name);
    }
  }
  return names;
}

// "Donna is typing…", "Donna and Caro are typing…", "3 people are typing…".
// Never lists more than two names.
export function typingLabel(names) {
  const list = [...new Set((names || []).filter((n) => typeof n === "string" && n))];
  if (list.length === 0) return "";
  if (list.length === 1) return `${list[0]} is typing…`;
  if (list.length === 2) return `${list[0]} and ${list[1]} are typing…`;
  return `${list.length} people are typing…`;
}

// ---- store -----------------------------------------------------------------

const listeners = new Set();
let state = {};

export function subscribeTyping(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTypingState() {
  return state;
}

// Publish the current typers for one conversation. No-ops when unchanged so
// subscribers don't re-render on every throttle tick.
export function publishTyping(conversationId, names) {
  const next = Array.isArray(names) ? names.filter(Boolean) : [];
  const current = state[conversationId] || [];
  if (
    current.length === next.length &&
    current.every((name, i) => name === next[i])
  ) {
    return;
  }
  state = { ...state, [conversationId]: next };
  for (const listener of listeners) listener(state);
}

export function clearTyping(conversationId) {
  publishTyping(conversationId, []);
}

// ---- privacy setting -------------------------------------------------------

const TYPING_HIDDEN_KEY = "yarnery-typing-hidden";

export function readTypingHidden() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TYPING_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeTypingHidden(hidden) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TYPING_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    // storage unavailable — the setting simply doesn't persist
  }
}

// Tiny external store so UI toggles stay in sync with the persisted flag and
// with the server snapshot (always false) during hydration.
const hiddenListeners = new Set();

export function subscribeTypingHidden(listener) {
  hiddenListeners.add(listener);
  return () => hiddenListeners.delete(listener);
}

export function getTypingHidden() {
  return readTypingHidden();
}

export function getTypingHiddenServer() {
  return false;
}

export function setTypingHidden(hidden) {
  writeTypingHidden(hidden);
  for (const listener of hiddenListeners) listener();
}
