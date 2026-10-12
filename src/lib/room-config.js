// Neutral, dependency-free room appearance config shared by the server
// (create/validation) and the client (admin create form + content editor).
//
// Keeping it here — rather than under lib/server — means the admin UI can import
// the same vibe/colour rules without pulling any server-only code into the
// browser bundle. Server code re-exports these from lib/server/rooms-core.js.

// The four signature lounges' audio personas, plus "none" for a plain lounge.
// `value` is persisted on Room.vibeMode; the flags below are derived from it so
// a room can never advertise one vibe while enforcing another.
export const ROOM_VIBE_MODES = [
  {
    value: "",
    label: "None",
    description: "No special audio policy — members control their own camera and mic.",
  },
  {
    value: "auto",
    label: "Open — camera & mic on",
    description: "Camera and mic turn on as soon as a member joins.",
  },
  {
    value: "force-mute",
    label: "Mics start muted",
    description: "Microphones join muted; members use text chat and unmute themselves.",
  },
  {
    value: "raise-hand",
    label: "Raise hand to talk",
    description: "Members raise a hand and the host invites them to speak.",
  },
  {
    value: "silent",
    label: "Silent — audio always off",
    description: "Audio stays off entirely; cameras only, for quiet company.",
  },
];

const VIBE_MODE_VALUES = new Set(ROOM_VIBE_MODES.map((mode) => mode.value));

/** Curated accent colours for lounge cards. */
export const ROOM_ACCENT_COLORS = [
  "#e91e63",
  "#a78bfa",
  "#2dd4bf",
  "#701a75",
  "#334155",
  "#f59e0b",
  "#0ea5e9",
  "#22c55e",
];

/** Returns a valid, persisted vibeMode value or "" when unknown. */
export function normalizeRoomVibeMode(value) {
  return typeof value === "string" && VIBE_MODE_VALUES.has(value) ? value : "";
}

/**
 * The room-level audio flags implied by a vibeMode. Derived (never taken from
 * the client) so the prejoin copy, buttons and enforced policy stay in sync.
 */
export function roomAudioFlagsForVibeMode(vibeMode) {
  switch (normalizeRoomVibeMode(vibeMode)) {
    case "auto":
      return { autoAudioVideo: true, forceMuteOnJoin: false, raiseHandToTalk: false, disableAudio: false };
    case "force-mute":
      return { autoAudioVideo: false, forceMuteOnJoin: true, raiseHandToTalk: false, disableAudio: false };
    case "raise-hand":
      return { autoAudioVideo: false, forceMuteOnJoin: false, raiseHandToTalk: true, disableAudio: false };
    case "silent":
      return { autoAudioVideo: false, forceMuteOnJoin: false, raiseHandToTalk: false, disableAudio: true };
    default:
      return { autoAudioVideo: false, forceMuteOnJoin: false, raiseHandToTalk: false, disableAudio: false };
  }
}

/**
 * Normalizes a hex accent colour to lowercase #rrggbb, or "" when it is not a
 * valid 3/6-digit hex. 3-digit values are expanded so the stored value is
 * always comparable.
 */
export function normalizeRoomColor(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(trimmed);
  if (!match) return "";
  const hex = match[1];
  return hex.length === 3
    ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
    : `#${hex}`;
}

const MAX_IMAGE_URL = 12_000_000; // generous: allows a base64 data URL fallback
const MAX_MUSIC_URL = 2000;
const MAX_MUSIC_FILE_ID = 200;
const MAX_TEXT = 500;
const MAX_VIBE = 200;
const MAX_MUSIC_NAME = 200;
const REPLAY_VISIBILITIES = new Set(["members", "owner"]);

function clampInt(value, min, max, fallback) {
  const num = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function cleanString(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/**
 * Reduces an untrusted create/edit body to the persisted lounge appearance
 * fields. Pure and total: bad values collapse to safe defaults rather than
 * throwing, so the caller can write the result directly.
 *
 * Audio flags are derived from `vibeMode` (see roomAudioFlagsForVibeMode) so a
 * crafted request cannot set an inconsistent combination.
 */
export function sanitizeRoomAppearance(input = {}) {
  const vibeMode = normalizeRoomVibeMode(input.vibeMode);
  const flags = roomAudioFlagsForVibeMode(vibeMode);
  const replay = typeof input.replayVisibility === "string" && REPLAY_VISIBILITIES.has(input.replayVisibility)
    ? input.replayVisibility
    : "members";
  return {
    maxParticipants: clampInt(input.maxParticipants, 2, 500, 20),
    alwaysOn: !!input.alwaysOn,
    vibe: cleanString(input.vibe, MAX_VIBE),
    vibeMode,
    color: normalizeRoomColor(input.color),
    rule: cleanString(input.rule, MAX_TEXT),
    imageUrl: cleanString(input.imageUrl, MAX_IMAGE_URL),
    musicUrl: cleanString(input.musicUrl, MAX_MUSIC_URL),
    musicFileId: cleanString(input.musicFileId, MAX_MUSIC_FILE_ID),
    musicName: cleanString(input.musicName, MAX_MUSIC_NAME),
    musicPlaying: !!input.musicPlaying,
    recordingAllowed: input.recordingAllowed === undefined ? true : !!input.recordingAllowed,
    replayVisibility: replay,
    ...flags,
  };
}
