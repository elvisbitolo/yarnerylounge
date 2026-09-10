"use client";

import { useEffect, useState } from "react";
import { useMembership } from "@/lib/membership";
import {
  THEME_KEYS,
  DEFAULT_THEME,
  PRESETS,
  sanitizeTheme,
  mergeTheme,
  applyThemeToDom,
  saveTheme,
} from "@/lib/site-theme";

const FONT_KEY = "yarnerylounge-font-size";
const SIZE_STEP = 6;

const LABELS = {
  bg: "Background",
  surface: "Surface / cards",
  border: "Borders",
  text: "Text",
  muted: "Muted text",
  accent: "Accent colour",
  link: "Links",
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
      <label style={{ flex: 1, fontSize: 12, color: "#a3a3a3", fontWeight: 500 }}>{label}</label>
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
          border: "1px solid #3a3a3a",
          background: "#171717",
          color: "#e5e5e5",
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

  useEffect(() => {
    setTheme((prev) => mergeTheme(DEFAULT_THEME, sanitizeTheme(membership?.theme)));
  }, [membership?.theme]);

  function commit(next) {
    const t = sanitizeTheme(next);
    setTheme(mergeTheme(DEFAULT_THEME, t));
    applyThemeToDom(mergeTheme(DEFAULT_THEME, t));
    saveTheme(t, refresh);
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

  async function resetTheme() {
    setTheme(DEFAULT_THEME);
    applyThemeToDom(DEFAULT_THEME);
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

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#9a9a9a",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          margin: "0 0 8px",
        }}
      >
        Presets
      </div>
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
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 6px",
                borderRadius: 10,
                border: active ? "2px solid #f42e79" : "1px solid #3a3a3a",
                background: p.surface,
                cursor: "pointer",
                boxShadow: active ? "0 0 0 1px rgba(244,46,121,0.3)" : "none",
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: p.text }}>{p.name}</span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#9a9a9a",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          margin: "0 0 8px",
        }}
      >
        Custom colours
      </div>
      {THEME_KEYS.map((key) => (
        <ColorRow key={key} label={LABELS[key]} value={theme[key]} onChange={(v) => updateColor(key, v)} />
      ))}

      <button
        type="button"
        onClick={resetTheme}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "8px 0",
          borderRadius: 10,
          border: "1px solid #3a3a3a",
          background: "transparent",
          color: "#cfcfcf",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Use community theme
      </button>

      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#9a9a9a",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          margin: "16px 0 8px",
        }}
      >
        Text size
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => stepFont(-SIZE_STEP)}
          aria-label="Decrease text size"
          style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 15, cursor: "pointer" }}
        >
          A−
        </button>
        <span style={{ color: "#fff", fontSize: 12.5, minWidth: 42, textAlign: "center" }}>
          {clampFont()}%
        </span>
        <button
          type="button"
          onClick={() => stepFont(SIZE_STEP)}
          aria-label="Increase text size"
          style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 15, cursor: "pointer" }}
        >
          A+
        </button>
        <button
          type="button"
          onClick={resetFont}
          aria-label="Reset text size"
          style={{ flex: 1, height: 32, borderRadius: 9, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 12, cursor: "pointer" }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export { Swatch }; // keep old swatch import path happy if referenced anywhere