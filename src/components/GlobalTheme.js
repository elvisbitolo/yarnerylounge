"use client";

import { useEffect } from "react";
import { useMembership } from "@/lib/membership";
import { DEFAULT_SPEAKEASY_THEME } from "@/lib/speakeasy-theme";

const VAR_MAP = {
  bg: ["--background", "--dash-bg"],
  surface: ["--dash-surface"],
  border: ["--dash-border"],
  text: ["--foreground", "--dash-text"],
  muted: ["--dash-muted"],
  accent: ["--dash-accent"],
  primary: ["--primary"],
};

function applyTheme(theme) {
  if (!theme) return;
  const r = document.documentElement;
  for (const [key, vars] of Object.entries(VAR_MAP)) {
    if (!theme[key]) continue;
    for (const v of vars) r.style.setProperty(v, theme[key]);
  }
}

export default function GlobalTheme() {
  const { membership } = useMembership();

  useEffect(() => {
    // Hardcoded speakeasy defaults first so the app never relies on the API.
    applyTheme(DEFAULT_SPEAKEASY_THEME);

    const hasUserPick = () => {
      try {
        return typeof localStorage !== "undefined" && localStorage.getItem("yarnerylounge-theme") !== null;
      } catch {
        return false;
      }
    };

    const applyCommunityTheme = () => {
      if (hasUserPick()) return;
      applyTheme(membership?.theme || null);
    };

    applyCommunityTheme();

    // ThemePicker's "Use community theme" tells us a member reverted their
    // override — re-apply the saved community theme right away.
    const onRevert = () => applyCommunityTheme();
    window.addEventListener("yarnery-theme-revert", onRevert);
    return () => window.removeEventListener("yarnery-theme-revert", onRevert);
  }, [membership?.theme]);

  return null;
}