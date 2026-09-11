"use client";

import { useState } from "react";
import useDraggableFloat from "@/lib/use-draggable-float";
import ThemePanel from "@/components/ThemePanel";
import { useMembership } from "@/lib/membership";
import {
  DEFAULT_THEME,
  APPEARANCE_PRESETS,
  mergeTheme,
  sanitizeTheme,
  applyThemeToDom,
  saveTheme,
} from "@/lib/site-theme";

const POS_KEY = "yarnerylounge-theme-pos";
const FAB_SIZE = 48;

export default function ThemePicker() {
  const { membership, refresh } = useMembership();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem("yarnerylounge-color-mode") === "light" ? "light" : "dark";
  });
  const drag = useDraggableFloat({
    storageKey: POS_KEY,
    defaultPos: { right: 16, bottom: 96 },
    width: FAB_SIZE,
    height: FAB_SIZE,
    minBottom: 76,
  });

  const [themeRef, setThemeRef] = useState(membership?.theme);

  // Sync the light/dark mode when the saved theme arrives/changes. This is the
  // React-recommended "adjust state during render" pattern (guarded, so it runs
  // once) instead of setState inside an effect, which lint flags and re-renders.
  if (membership?.theme !== themeRef) {
    setThemeRef(membership?.theme);
    const saved = sanitizeTheme(membership?.theme);
    const hasSavedVisual = saved.bg || saved.text;
    if (hasSavedVisual) {
      setMode(APPEARANCE_PRESETS.light.bg === saved.bg ? "light" : "dark");
    }
  }

  function effectiveTheme() {
    return mergeTheme(DEFAULT_THEME, sanitizeTheme(membership?.theme));
  }

  function toggleAppearance() {
    const current = effectiveTheme();
    const nextMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    const appearance = APPEARANCE_PRESETS[nextMode];
    const next = mergeTheme(current, { ...appearance, accent: current.accent, link: current.link });
    applyThemeToDom(next);
    saveTheme(sanitizeTheme(next), refresh);
    try {
      localStorage.setItem("yarnerylounge-color-mode", nextMode);
    } catch {
      /* ignore */
    }
  }

  function handleToggleClick() {
    if (drag.wasDragged()) return;
    if (!open) {
      // Clicking the FAB when closed toggles light/dark (fast path); it also
      // opens the full customizer panel so members always see the controls.
      toggleAppearance();
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  const accent = effectiveTheme().accent;

  return (
    <div style={{ ...drag.style, right: drag.pos.right }}>
      <button
        {...drag.handlers}
        onClick={handleToggleClick}
        aria-label={open ? "Close theme panel" : "Switch light/dark theme; open theme panel"}
        title="Drag to move · click to toggle light/dark"
        style={{
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.18)",
          background: accent,
          cursor: "grab",
          touchAction: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 6px 20px ${accent}55`,
          transition: "box-shadow 0.2s ease",
          userSelect: "none",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: FAB_SIZE + 8,
            right: 0,
            background: "#1c1c1c",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16,
            padding: 16,
            width: 240,
            maxHeight: "min(70vh, 560px)",
            overflowY: "auto",
            boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
            zIndex: 101,
          }}
        >
          <p style={{ margin: "0 0 10px", color: "#fff", fontSize: 13, fontWeight: 700 }}>
            Customize theme
          </p>
          <p style={{ margin: "0 0 12px", color: "#cfcfcf", fontSize: 11.5 }}>
            Choose a preset or pick your own colours — they apply across the whole site.
          </p>
          <ThemePanel />
        </div>
      )}
    </div>
  );
}