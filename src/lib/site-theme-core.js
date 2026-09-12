// Isolated, framework-free theme helpers. No "use client" / "use server"
// directives, so both client components and server routes can import them.
//
// Shape: { bg, surface, border, text, muted, accent, link }
// Every value is a #rrggbb hex string. The same shape is persisted per member
// under the User.extra.dashboardTheme (Prisma) and mirrored into
// membership.theme server-side — see /api/dashboard/theme and
// src/lib/server/membership.js.

export const THEME_KEYS = ["bg", "surface", "border", "text", "muted", "accent", "link"];

// The app's Dark Luxury default (matches globals.css :root tokens) so the UI
// never has to wait for the saved theme to arrive.
export const DEFAULT_THEME = {
  bg: "#000000",
  surface: "#111111",
  border: "#27272a",
  text: "#f2f2f2",
  muted: "#9a9a9a",
  accent: "#e91e63",
  link: "#f06292",
};

// Light / dark appearance shells. The accent + link colors ride on top.
export const APPEARANCE_PRESETS = {
  dark: {
    bg: "#000000",
    surface: "#111111",
    border: "#27272a",
    text: "#f2f2f2",
    muted: "#9a9a9a",
  },
  light: {
    bg: "#f7f1e9",
    surface: "#ffffff",
    border: "#eadfd2",
    text: "#171a33",
    muted: "#8a7c6f",
  },
};

// Curated full themes shown as quick presets.
export const PRESETS = [
  {
    name: "Dark Luxury",
    ...DEFAULT_THEME,
  },
  {
    name: "Cream",
    bg: "#f7f1e9",
    surface: "#ffffff",
    border: "#eadfd2",
    text: "#171a33",
    muted: "#8a7c6f",
    accent: "#f42e79",
    link: "#d81f66",
  },
  {
    name: "Linen",
    bg: "#fbf7f1",
    surface: "#ffffff",
    border: "#f0e8dd",
    text: "#0a0e2a",
    muted: "#9c8f82",
    accent: "#f42e79",
    link: "#d81f66",
  },
  {
    name: "Blush",
    bg: "#faefe9",
    surface: "#ffffff",
    border: "#f0dfd4",
    text: "#3a2e28",
    muted: "#a08a78",
    accent: "#d81f66",
    link: "#c2185b",
  },
  {
    name: "Mist",
    bg: "#eef2f7",
    surface: "#ffffff",
    border: "#dde5ee",
    text: "#1d2433",
    muted: "#76808f",
    accent: "#f42e79",
    link: "#d81f66",
  },
  {
    name: "Arctic",
    bg: "#f4f6fc",
    surface: "#ffffff",
    border: "#d8e0ec",
    text: "#1a2233",
    muted: "#5a6578",
    accent: "#f42e79",
    link: "#d81f66",
  },
  {
    name: "Midnight",
    bg: "#0a0a10",
    surface: "#14141e",
    border: "#26262f",
    text: "#eceaf2",
    muted: "#8e8ba0",
    accent: "#7c6cf2",
    link: "#a99dff",
  },
  {
    name: "Forest",
    bg: "#0c110d",
    surface: "#151d15",
    border: "#263324",
    text: "#e9f0e7",
    muted: "#96a890",
    accent: "#4caf50",
    link: "#7dd87f",
  },
  {
    name: "Coffee",
    bg: "#160f0a",
    surface: "#211812",
    border: "#382b21",
    text: "#f0e8e0",
    muted: "#b39a86",
    accent: "#d18f4f",
    link: "#e6b07a",
  },
];

export function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

// Returns a theme object with only the known keys, each validated as a hex
// color. Used both client-side and by the save route (imported directly there).
export function sanitizeTheme(input) {
  if (!input || typeof input !== "object") return {};
  const safe = {};
  for (const key of THEME_KEYS) {
    if (isHexColor(input[key])) safe[key] = input[key].toLowerCase();
  }
  return safe;
}

export function mergeTheme(base, overrides) {
  const out = { ...(base || {}) };
  for (const key of THEME_KEYS) {
    if (isHexColor(overrides?.[key])) out[key] = overrides[key];
  }
  return out;
}

export function appearanceOf(theme) {
  if (!theme || !isHexColor(theme.bg)) return "dark";
  return theme.bg.toLowerCase() === APPEARANCE_PRESETS.light.bg ? "light" : "dark";
}