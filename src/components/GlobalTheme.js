"use client";

import { useEffect } from "react";
import { useMembership } from "@/lib/membership";
import {
  DEFAULT_THEME,
  mergeTheme,
  sanitizeTheme,
  applyThemeToDom,
} from "@/lib/site-theme";

// Single source of truth for the member-controlled site theme. Renders nothing:
// it just mirrors the saved dashboardTheme (membership.theme) onto the shared
// CSS custom properties on every page. The other theme UI (ThemePicker) edits
// and persists that same object — nothing else writes these variables, so the
// saved theme can never get clobbered by a competing applier.
export default function GlobalTheme() {
  const { membership } = useMembership();

  useEffect(() => {
    const saved = sanitizeTheme(membership?.theme);
    applyThemeToDom(mergeTheme(DEFAULT_THEME, saved));

    // ThemePicker's "Use community theme" tells us a member reverted their
    // override — re-apply the saved (now cleared) theme right away.
    const onRevert = () => {
      const next = sanitizeTheme(membership?.theme);
      applyThemeToDom(mergeTheme(DEFAULT_THEME, next));
    };
    window.addEventListener("yarnery-theme-revert", onRevert);
    return () => window.removeEventListener("yarnery-theme-revert", onRevert);
  }, [membership?.theme]);

  // Restore the member's saved text-size on every page load. ThemePanel writes
  // the same key but only lives inside the settings panel, so without this the
  // size "UI" resets after every refresh even though it was never applied live.
  useEffect(() => {
    const FONT_KEY = "yarnerylounge-font-size";
    let saved = 100;
    try {
      const raw = parseInt(localStorage.getItem(FONT_KEY), 10);
      if (raw >= 82 && raw <= 124) saved = raw;
    } catch {
      /* ignore */
    }
    if (saved !== 100) {
      document.documentElement.style.fontSize = `${saved}%`;
    }
  }, []);

  return null;
}

export { THEME_KEYS } from "@/lib/site-theme";