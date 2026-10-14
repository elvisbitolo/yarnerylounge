// Chat appearance (WhatsApp-style wallpaper + accent). Viewers pick a chat
// background globally in Chat settings or per conversation from the chat-info
// drawer; an optional custom image can be uploaded. A chat accent color can
// also be chosen globally. Everything is stored in the same user.extra JSON
// bag as the other chat prefs, under `extra.appearance`:
//
//   appearance = {
//     wallpaper: "default" | presetId | "custom",
//     customWallpaper: "data:image/...;base64,...",   // only when custom
//     perChat: { [conversationId]: "default" | presetId | "custom" },
//     accent: null | accentId                        // null = brand default
//   }
//
// Only the id is stored for presets/accents — the actual styling lives here,
// so the set can be adjusted without touching anyone's stored data.

// Each preset is a CSS `background` value applied to the thread.
export const CHAT_WALLPAPERS = [
  { id: "mint", label: "Mint", background: "linear-gradient(160deg, #0a3d33 0%, #167d6a 100%)" },
  { id: "ocean", label: "Ocean", background: "linear-gradient(160deg, #0a2d4a 0%, #14598b 100%)" },
  { id: "dusk", label: "Dusk", background: "linear-gradient(160deg, #341a52 0%, #6d2b6e 100%)" },
  { id: "warm", label: "Warm", background: "linear-gradient(160deg, #42250f 0%, #7a4a1e 100%)" },
  { id: "forest", label: "Forest", background: "linear-gradient(160deg, #123a23 0%, #25603b 100%)" },
  { id: "slate", label: "Slate", background: "linear-gradient(160deg, #23232b 0%, #3a3a45 100%)" },
  {
    id: "candy",
    label: "Candy",
    background: "linear-gradient(140deg, #60212e 0%, #b04a5a 55%, #6d2b6e 100%)",
  },
  {
    id: "dots",
    label: "Dots",
    background: "radial-gradient(circle, #30303a 2px, transparent 2.6px) 0 0 / 24px 24px, #1b1b24",
  },
  {
    id: "lines",
    label: "Lines",
    background: "repeating-linear-gradient(45deg, #26262f 0 14px, #1f1f28 14px 28px)",
  },
];

export const WALLPAPER_IDS = new Set(CHAT_WALLPAPERS.map((w) => w.id));

// Chat accent colors. Every entry is curated for legibility in BOTH of the
// places an accent lands:
//   1. As the .mine bubble background — so its color paired with the near-white
//      bubble text keeps WCAG-style contrast (>= a few :1, min for large/high
//      visibility text like chat bubbles).
//   2. As small accent *text* (names, timestamps, reactions, links, divider)
//      on the dark incoming bubble/thread surface (#26262e ish) — so it has to
//      sit bright enough to read on near-black too.
// Light pastels are deliberately excluded: on a pale bubble the fixed
// near-white bubble "chrome" (time, ticks, action tint) would wash out. The
// whole set reads as white-on-color, so bubble text stays crisp.
export const CHAT_ACCENTS = [
  { id: "rose", label: "Rose", color: "#e14a68" },
  { id: "berry", label: "Berry", color: "#c9316b" },
  { id: "grape", label: "Grape", color: "#8e5cf7" },
  { id: "indigo", label: "Indigo", color: "#5b6beb" },
  { id: "ocean", label: "Ocean", color: "#2f86eb" },
  { id: "teal", label: "Teal", color: "#0f9d8b" },
  { id: "forest", label: "Forest", color: "#2e8b57" },
  { id: "ember", label: "Ember", color: "#d9592c" },
];

export const ACCENT_IDS = new Set(CHAT_ACCENTS.map((a) => a.id));

export const DEFAULT_APPEARANCE = { wallpaper: "default", customWallpaper: "", accent: null };

// Custom wallpapers are compressed on the client and capped here so they stay
// small inside the user's extra JSON.
export const MAX_CUSTOM_WALLPAPER = 700_000;

const isSafeCustomWallpaper = (value) =>
  typeof value === "string" &&
  value.length >= 32 &&
  value.length <= MAX_CUSTOM_WALLPAPER &&
  /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value);

const baseOf = (appearance) => (appearance && typeof appearance === "object" ? appearance : {});

export function isWallpaperChoice(value) {
  return value === "default" || value === "custom" || WALLPAPER_IDS.has(value);
}

const isKnownAccent = (value) => typeof value === "string" && ACCENT_IDS.has(value);

// The accent color to theme the thread with, or `null` for the brand default.
export function accentColorFor(appearance) {
  const app = baseOf(appearance);
  if (!isKnownAccent(app.accent)) return null;
  return CHAT_ACCENTS.find((a) => a.id === app.accent).color;
}

// Merges a PATCH (wallpaper choice, custom image and/or accent) onto the stored
// appearance. A new custom image always wins and becomes the chosen wallpaper;
// a choice pointing at "custom" is only honored if an image is already stored.
export function applyAppearancePatch(current, patch) {
  const base = baseOf(current);
  const merged = {
    wallpaper: typeof base.wallpaper === "string" ? base.wallpaper : "default",
    customWallpaper: typeof base.customWallpaper === "string" ? base.customWallpaper : "",
    accent: isKnownAccent(base.accent) ? base.accent : null,
  };
  const patchBase = baseOf(patch);
  if (isSafeCustomWallpaper(patchBase.customWallpaper)) {
    merged.wallpaper = "custom";
    merged.customWallpaper = patchBase.customWallpaper;
  } else if (typeof patchBase.wallpaper === "string") {
    if (patchBase.wallpaper === "default" || WALLPAPER_IDS.has(patchBase.wallpaper)) {
      merged.wallpaper = patchBase.wallpaper;
    } else if (patchBase.wallpaper === "custom" && merged.customWallpaper) {
      merged.wallpaper = "custom";
    }
  }
  if (patchBase.accent === "default" || patchBase.accent === null) {
    merged.accent = null;
  } else if (isKnownAccent(patchBase.accent)) {
    merged.accent = patchBase.accent;
  }
  return merged;
}

// Stores a per-conversation override ("default" / "custom" / a preset id).
export function applyPerChatOverride(current, conversationId, value) {
  const base = baseOf(current);
  const perChat = base.perChat && typeof base.perChat === "object" ? { ...base.perChat } : {};
  if (isWallpaperChoice(value)) {
    perChat[conversationId] = value;
  }
  return {
    wallpaper: typeof base.wallpaper === "string" ? base.wallpaper : "default",
    customWallpaper: typeof base.customWallpaper === "string" ? base.customWallpaper : "",
    accent: isKnownAccent(base.accent) ? base.accent : null,
    perChat,
  };
}

// The `background` value to paint the thread with for a conversation, or
// `null` for the normal app background.
export function wallpaperBackgroundFor(appearance, conversationId) {
  const app = baseOf(appearance);
  const choice = (app.perChat && app.perChat[conversationId]) || "default";
  if (choice === "default") return wallpaperBackground(app.wallpaper, app.customWallpaper);
  return wallpaperBackground(choice, app.customWallpaper);
}

function wallpaperBackground(wallpaper, customWallpaper) {
  if (wallpaper === "default") return null;
  if (wallpaper === "custom") {
    const url = isSafeCustomWallpaper(customWallpaper) ? customWallpaper : "";
    return url ? `no-repeat center/cover url("${url}")` : null;
  }
  const preset = CHAT_WALLPAPERS.find((w) => w.id === wallpaper);
  return preset ? preset.background : null;
}