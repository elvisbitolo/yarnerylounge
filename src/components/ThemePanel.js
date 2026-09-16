"use client";

import { useEffect, useRef, useState } from "react";
import { useMembership } from "@/lib/membership";
import {
  THEME_KEYS,
  DEFAULT_THEME,
  APPEARANCE_PRESETS,
  PRESETS,
  sanitizeTheme,
  mergeTheme,
  appearanceOf,
  applyThemeToDom,
  saveTheme,
  contrastRatio,
} from "@/lib/site-theme";

const FONT_KEY = "yarnerylounge-font-size";
const SIZE_STEP = 6;
const SAVE_DEBOUNCE_MS = 500;

const LABELS = {
  bg: "Background",
  surface: "Surface / cards",
  border: "Borders",
  text: "Text",
  muted: "Muted text",
  accent: "Accent colour",
  link: "Links",
};

// Theme-aware tokens for the panel chrome, with the dark defaults as fallback
// so the panel always reads cleanly no matter which theme is applied.
const V = {
  text: "var(--text, #f2f2f2)",
  muted: "var(--muted, #9a9a9a)",
  surface: "var(--surface, #111111)",
  bg: "var(--bg, #000000)",
  border: "var(--border, #27272a)",
  primary: "var(--primary, #e91e63)",
};

function Swatch({ color, size = 22 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: color,
        border: "1px solid rgba(0,0,0,0.14)",
        flexShrink: 0,
      }}
    />
  );
}

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <label style={{ flex: 1, fontSize: 12, color: V.muted, fontWeight: 500 }}>{label}</label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          width: 30,
          height: 30,
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          background: "transparent",
          padding: 0,
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(e.target.value)) onChange(e.target.value);
        }}
        onBlur={(e) => {
          if (!/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange("#" + e.target.value.replace(/^#/, "").padEnd(6, "0").slice(0, 6));
        }}
        style={{
          width: 78,
          padding: "5px 8px",
          borderRadius: 8,
          border: `1px solid ${V.border}`,
          background: V.bg,
          color: V.text,
          fontSize: 11,
          fontFamily: "monospace",
          outline: "none",
        }}
      />
    </div>
  );
}

export default function ThemePanel() {
  const { membership, refresh } = useMembership();
  const [theme, setTheme] = useState(() => mergeTheme(DEFAULT_THEME, sanitizeTheme(membership?.theme)));
  const [themeSource, setThemeSource] = useState(membership?.theme);
  const [warning, setWarning] = useState(null);
  const savedRef = useRef(theme);
  const saveTimer = useRef(null);
  const pendingRef = useRef(null);

  // Keep the swatches in sync when the saved theme arrives/changes. This is the
  // React-recommended "adjust state during render" pattern (guarded, so it runs
  // once) instead of setState inside an effect, which lint flags and re-renders.
  if (membership?.theme !== themeSource) {
    setThemeSource(membership?.theme);
    const saved = mergeTheme(DEFAULT_THEME, sanitizeTheme(membership?.theme));
    savedRef.current = saved;
    setTheme(saved);
  }

  // Flush any pending save on unmount so a quick navigation never drops a theme edit.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingRef.current) {
        saveTheme(sanitizeTheme(pendingRef.current), refresh);
      }
    };
  }, [refresh]);

  function scheduleSave(merged) {
    pendingRef.current = merged;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      pendingRef.current = null;
      saveTheme(sanitizeTheme(merged), refresh);
    }, SAVE_DEBOUNCE_MS);
  }

  function updateWarning(merged) {
    const msgs = [];
    if (contrastRatio(merged.text, merged.bg) < 4.5 || contrastRatio(merged.text, merged.surface) < 4.5) {
      msgs.push("Text doesn't contrast enough with the background.");
    }
    if (contrastRatio(merged.muted, merged.bg) < 4.5) {
      msgs.push("Muted text is hard to read on the background.");
    }
    if (contrastRatio(merged.accent, merged.bg) < 3) {
      msgs.push("The accent colour has low contrast with the background.");
    }
    setWarning(msgs.length ? msgs.join(" ") : null);
  }

  function commit(next) {
    const merged = mergeTheme(DEFAULT_THEME, sanitizeTheme(next));
    setTheme(merged);
    applyThemeToDom(merged);
    updateWarning(merged);
    scheduleSave(merged);
  }

  function toggleAppearance() {
    const nextMode = appearanceOf(theme) === "light" ? "dark" : "light";
    const appearance = APPEARANCE_PRESETS[nextMode];
    commit(mergeTheme(theme, { ...appearance, accent: theme.accent, link: theme.link }));
  }

  function applyPreset(preset) {
    commit(mergeTheme(DEFAULT_THEME, preset));
  }

  function updateColor(key, value) {
    commit({ ...theme, [key]: value });
  }

  function stepFont(delta) {
    const current = clampFont();
    const next = Math.min(124, Math.max(82, current + delta));
    applyFont(next);
  }

  function clampFont() {
    let saved = 100;
    try {
      saved = parseInt(localStorage.getItem(FONT_KEY), 10);
    } catch {
      /* ignore */
    }
    return saved >= 82 && saved <= 124 ? saved : 100;
  }

  function applyFont(percent) {
    // Text-only scaling. Setting html{font-size} affects rem/em text without
    // zooming the whole page — zooming <html> shrinks the layout width too,
    // which made the site look 3/4 in Firefox when A- was pressed.
    document.documentElement.style.fontSize = percent === 100 ? "" : `${percent}%`;
    try {
      if (percent === 100) localStorage.removeItem(FONT_KEY);
      else localStorage.setItem(FONT_KEY, percent.toString());
    } catch {
      /* ignore */
    }
  }

  function resetFont() {
    applyFont(100);
  }

  function discard() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingRef.current = null;
    const saved = savedRef.current;
    setTheme(saved);
    applyThemeToDom(saved);
    setWarning(null);
  }

  async function resetTheme() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingRef.current = null;
    setTheme(DEFAULT_THEME);
    applyThemeToDom(DEFAULT_THEME);
    setWarning(null);
    try {
      await fetch("/api/dashboard/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: {} }),
      });
    } catch {
      /* ignore */
    }
    if (typeof refresh === "function") refresh();
    window.dispatchEvent(new Event("yarnery-theme-revert"));
  }

  const savedJSON = JSON.stringify(savedRef.current);
  const dirty = JSON.stringify(theme) !== savedJSON;
  const sectionLabel = {
    fontSize: 11,
    fontWeight: 600,
    color: V.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0 0 8px",
  };

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 18,
        }}
      >
        {(["dark", "light"]).map((mode) => {
          const active = appearanceOf(theme) === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => {
                if (!active) toggleAppearance();
              }}
              aria-pressed={active}
              style={{
                padding: "7px 0",
                borderRadius: 10,
                border: active ? `1px solid ${V.primary}` : `1px solid ${V.border}`,
                background: active ? "color-mix(in srgb, var(--primary, #e91e63) 14%, transparent)" : "transparent",
                color: active ? V.primary : V.text,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {mode === "dark" ? "Dark mode" : "Light mode"}
            </button>
          );
        })}
      </div>

      <div style={sectionLabel}>Presets</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
        {PRESETS.map((p) => {
          const active =
            theme.bg === p.bg &&
            theme.surface === p.surface &&
            theme.text === p.text &&
            theme.accent === p.accent;
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              title={p.name}
              aria-label={`Apply ${p.name} theme`}
              aria-pressed={active}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 6px",
                borderRadius: 10,
                border: active ? `2px solid ${V.primary}` : `1px solid ${V.border}`,
                background: p.surface,
                cursor: "pointer",
                boxShadow: active ? "0 0 0 1px color-mix(in srgb, var(--primary, #e91e63) 30%, transparent)" : "none",
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: p.text }}>{p.name}</span>
            </button>
          );
        })}
      </div>

      <div style={sectionLabel}>Custom colours</div>
      {THEME_KEYS.map((key) => (
        <ColorRow key={key} label={LABELS[key]} value={theme[key]} onChange={(v) => updateColor(key, v)} />
      ))}

      {warning && (
        <div
          role="status"
          style={{
            marginTop: 12,
            padding: "8px 10px",
            borderRadius: 10,
            background: "color-mix(in srgb, var(--accent, #f42e79) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent, #f42e79) 40%, transparent)",
            color: V.text,
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          {warning}
        </div>
      )}

      {dirty && (
        <button
          type="button"
          onClick={discard}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "8px 0",
            borderRadius: 10,
            border: `1px solid ${V.border}`,
            background: "transparent",
            color: V.text,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Discard changes
        </button>
      )}

      <button
        type="button"
        onClick={resetTheme}
        style={{
          width: "100%",
          marginTop: dirty ? 8 : 12,
          padding: "8px 0",
          borderRadius: 10,
          border: `1px solid ${V.border}`,
          background: "transparent",
          color: V.text,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Use community theme
      </button>

      <div style={{ ...sectionLabel, margin: "16px 0 8px" }}>Text size</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => stepFont(-SIZE_STEP)}
          aria-label="Decrease text size"
          style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${V.border}`, background: "transparent", color: V.text, fontSize: 15, cursor: "pointer" }}
        >
          A−
        </button>
        <span style={{ color: V.text, fontSize: 12.5, minWidth: 42, textAlign: "center" }}>
          {clampFont()}%
        </span>
        <button
          type="button"
          onClick={() => stepFont(SIZE_STEP)}
          aria-label="Increase text size"
          style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${V.border}`, background: "transparent", color: V.text, fontSize: 15, cursor: "pointer" }}
        >
          A+
        </button>
        <button
          type="button"
          onClick={resetFont}
          aria-label="Reset text size"
          style={{ flex: 1, height: 32, borderRadius: 9, border: `1px solid ${V.border}`, background: "transparent", color: V.text, fontSize: 12, cursor: "pointer" }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export { Swatch }; // keep old swatch import path happy if referenced anywhere