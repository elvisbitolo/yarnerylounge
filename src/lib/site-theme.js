"use client";

// Client-side theme behaviour. The pure theme model lives in
// site-theme-core so server routes can validate/save themes too; this module
// keeps the DOM application + persistence and re-exports the shared pieces.
import {
  THEME_KEYS,
  DEFAULT_THEME,
  APPEARANCE_PRESETS,
  PRESETS,
  isHexColor,
  sanitizeTheme,
  mergeTheme,
  appearanceOf,
} from "./site-theme-core";

export {
  THEME_KEYS,
  DEFAULT_THEME,
  APPEARANCE_PRESETS,
  PRESETS,
  isHexColor,
  sanitizeTheme,
  mergeTheme,
  appearanceOf,
} from "./site-theme-core";

// Which CSS custom properties each theme key drives. `accent` fans out to the
// primary/link tokens so one choice restyles buttons, links, tabs and active
// navigation across the whole app. The specialised dashboard chart hues
// (--dash-cyan / --dash-info / --dash-success) are intentionally left to their
// globals.css defaults so dashboards keep their multi-color look.
const VAR_MAP = {
  bg: ["--background", "--dash-bg", "--bg"],
  surface: ["--surface", "--surface-muted", "--dash-surface", "--card-bg"],
  border: ["--border", "--dash-border", "--card-border", "--warm-border"],
  text: ["--foreground", "--text", "--dash-text", "--card-title", "--card-text"],
  muted: ["--muted", "--card-muted", "--dash-muted"],
  accent: [
    "--primary",
    "--primary-hover",
    "--primary-active",
    "--accent",
    "--accent-hover",
    "--dash-accent",
    "--dash-accent-hover",
    "--card-accent",
  ],
  link: ["--link", "--link-hover"],
};

const isServer = typeof window === "undefined";

export function applyThemeToDom(theme) {
  if (isServer) return;
  const themeSafe = theme && typeof theme === "object" ? theme : {};
  const root = document.documentElement;
  for (const key of THEME_KEYS) {
    const value = themeSafe[key];
    if (!isHexColor(value)) continue;
    const vars = VAR_MAP[key] || [];
    for (const v of vars) root.style.setProperty(v, value);
  }
  if (isHexColor(themeSafe.bg) && document.body) {
    document.body.style.backgroundColor = themeSafe.bg;
  }
}

// WCAG relative-luminance contrast between two #rrggbb colors (1:1 to 21:1).
export function contrastRatio(a, b) {
  if (!isHexColor(a) || !isHexColor(b)) return 1;
  const lin = (hex) => {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const c = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const l1 = lin(a);
  const l2 = lin(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// Persists the member theme and refreshes the shared membership context so
// GlobalTheme picks it up everywhere.
export async function saveTheme(theme, refresh) {
  try {
    const res = await fetch("/api/dashboard/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: sanitizeTheme(theme) }),
    });
    if (res.ok && typeof refresh === "function") refresh();
    return res.ok;
  } catch {
    return false;
  }
}