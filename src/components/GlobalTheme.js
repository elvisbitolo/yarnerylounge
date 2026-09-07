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
    // Hardcoded speakeasy defaults first so the app never relies on the API;
    // then the cached member theme (fetched once via MembershipProvider).
    applyTheme(DEFAULT_SPEAKEASY_THEME);
    applyTheme(membership?.theme || null);
  }, [membership?.theme]);

  return null;
}