// Pure helpers for the chat settings surfaces: global preferences (read
// receipts, online visibility, typing indicator, message sounds) and
// per-conversation preferences (mute, pin to top, archive). Both live in the
// user's `extra` JSON — `extra.chatSettings` and
// `extra.chatPrefs[conversationId]` — so this module never touches the schema.

export const CHAT_SETTINGS_DEFAULTS = Object.freeze({
  readReceipts: true,
  onlineVisibility: "everyone",
  typingHidden: false,
  messageSound: true,
});

const ONLINE_VISIBILITY = new Set(["everyone", "nobody"]);

export const CHAT_SETTINGS_KEYS = Object.freeze(Object.keys(CHAT_SETTINGS_DEFAULTS));

export const MUTE_DURATIONS = Object.freeze([
  { value: "off", label: "Off" },
  { value: "1h", label: "For 1 hour" },
  { value: "8h", label: "For 8 hours" },
  { value: "always", label: "Always" },
]);

const MUTE_WINDOW_MS = Object.freeze({
  "1h": 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
});

// Validates an incoming settings patch: unknown keys are dropped, booleans
// must be actual booleans and enums must match exactly. Returns only the valid
// subset so untrusted client input can never write junk into `extra`.
export function normalizeChatSettings(patch) {
  const out = {};
  if (patch == null || typeof patch !== "object") return out;
  for (const key of CHAT_SETTINGS_KEYS) {
    const value = patch[key];
    if (key === "onlineVisibility") {
      if (ONLINE_VISIBILITY.has(value)) out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export function mergeChatSettings(current, patch) {
  const normalized = normalizeChatSettings(patch);
  return { ...CHAT_SETTINGS_DEFAULTS, ...(current || {}), ...normalized };
}

// Reads the raw stored prefs for a single conversation (never undefined).
export function readChatPrefs(extra, conversationId) {
  const chatPrefs =
    extra && typeof extra === "object" && extra.chatPrefs && typeof extra.chatPrefs === "object"
      ? extra.chatPrefs
      : {};
  if (!conversationId || typeof chatPrefs[conversationId] !== "object") return {};
  return chatPrefs[conversationId];
}

// A muted conversation suppresses new-message notifications. `muted: true`
// means always; `mutedUntil` is the wall-clock timestamp a timed mute expires.
export function isConversationMuted(prefs, now = Date.now()) {
  if (!prefs || typeof prefs !== "object") return false;
  if (prefs.muted === true) return true;
  const until = Number(prefs.mutedUntil) || 0;
  return until > now;
}

// Composes a new prefs object from a mute selection ("off"/"1h"/"8h"/"always").
export function applyMuteSelection(prefs, value) {
  const base = prefs && typeof prefs === "object" ? prefs : {};
  if (value === "off") {
    const { muted, mutedUntil, ...rest } = base;
    return rest;
  }
  if (value === "always") return { ...base, muted: true, mutedUntil: 0 };
  const windowMs = MUTE_WINDOW_MS[value];
  if (!windowMs) return base;
  const { muted, ...rest } = base;
  return { ...rest, mutedUntil: Date.now() + windowMs };
}

// Best-effort mapping from stored prefs back to a mute-duration selection so a
// settings screen can render the mute state.
export function muteSelectionFromPrefs(prefs, now = Date.now()) {
  if (!isConversationMuted(prefs, now)) return "off";
  if (prefs && prefs.muted === true) return "always";
  const remaining = (Number(prefs && prefs.mutedUntil) || 0) - now;
  return remaining > 6.5 * 60 * 60 * 1000 ? "8h" : "1h";
}

// Validates a per-conversation prefs patch: `muted` takes a mute duration,
// `pinned`/`archived` take booleans. "off" unmutes explicitly, so it still
// counts as a write (wiping the mute window).
export function normalizeConversationPrefPatch(patch) {
  const out = {};
  if (patch == null || typeof patch !== "object") return out;
  if ("muted" in patch && MUTE_DURATIONS.some((d) => d.value === patch.muted)) {
    if (patch.muted === "off") {
      out.muted = false;
      out.mutedUntil = 0;
    } else {
      Object.assign(out, applyMuteSelection({}, patch.muted));
    }
  }
  if (typeof patch.pinned === "boolean") out.pinnedAt = patch.pinned ? Date.now() : 0;
  if (typeof patch.archived === "boolean") out.archivedAt = patch.archived ? Date.now() : 0;
  return out;
}

// Merges a patch into extra.chatPrefs and returns the updated chatPrefs map.
export function mergeConversationPrefs(extra, conversationId, patch) {
  const chatPrefs =
    extra && typeof extra === "object" && extra.chatPrefs && typeof extra.chatPrefs === "object"
      ? extra.chatPrefs
      : {};
  const current =
    chatPrefs[conversationId] && typeof chatPrefs[conversationId] === "object"
      ? chatPrefs[conversationId]
      : {};
  return { ...chatPrefs, [conversationId]: { ...current, ...patch } };
}

// Derives user-facing flags from the raw stored prefs.
export function resolveChatPrefs(prefs, now = Date.now()) {
  const base = prefs && typeof prefs === "object" ? prefs : {};
  return {
    pinned: !!base.pinnedAt,
    archived: !!base.archivedAt,
    muted: isConversationMuted(base, now),
    mutedUntil: Number(base.mutedUntil) || 0,
    pinnedAt: Number(base.pinnedAt) || 0,
    archivedAt: Number(base.archivedAt) || 0,
  };
}

// Overlays per-conversation prefs onto a list of conversation rows (used by the
// rail so pin/archive/mute changes show immediately after a write).
export function applyPrefsToConversations(rows, prefsById = {}) {
  return rows.map((row) => {
    const stored = prefsById[row.id];
    if (!stored || typeof stored !== "object") return row;
    return { ...row, ...resolveChatPrefs(stored) };
  });
}

// A message that @-mentions the recipient still notifies a muted conversation,
// matching chat apps where direct mentions break through.
export function containsMention(text, username) {
  if (!text || !username) return false;
  const needle = `@${String(username).trim().toLowerCase()}`;
  return String(text).toLowerCase().includes(needle);
}