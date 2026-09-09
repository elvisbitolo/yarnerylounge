"use client";

import { useState, useEffect, useRef } from "react";

// Magenta + Yellow is the default Secret Yarnery brand theme (index 0). The
// alternate palettes are available for members who prefer a different accent.
const THEMES = [
  {
    name: "Yarnery",
    primary: "#e91e63",
    primaryLight: "#f06292",
    primaryHover: "#c2185b",
    secondary: "#6d0f35",
    secondaryLight: "#ad1457",
    secondaryHover: "#56091f",
    accent: "#ffc81e",
    accentLight: "#ffd54f",
    accentHover: "#e6b31a",
    success: "#e91e63",
    warning: "#f59e0b",
    highlight: "#ffc81e",
  },
  {
    name: "Blue",
    primary: "#2563eb",
    primaryLight: "#60a5fa",
    primaryHover: "#1d4ed8",
    secondary: "#7c3aed",
    secondaryLight: "#a78bfa",
    secondaryHover: "#6d28d9",
    accent: "#06b6d4",
    accentLight: "#67e8f9",
    accentHover: "#0891b2",
    success: "#16a34a",
    warning: "#f59e0b",
    highlight: "#faf100",
  },
  {
    name: "Sky",
    primary: "#2563eb",
    primaryLight: "#93c5fd",
    primaryHover: "#1d4ed8",
    secondary: "#7c3aed",
    secondaryLight: "#c4b5fd",
    secondaryHover: "#6d28d9",
    accent: "#22d3ee",
    accentLight: "#a5f3fc",
    accentHover: "#06b6d4",
    success: "#16a34a",
    warning: "#f59e0b",
    highlight: "#faf100",
  },
  {
    name: "Violet",
    primary: "#2563eb",
    primaryLight: "#818cf8",
    primaryHover: "#1d4ed8",
    secondary: "#7c3aed",
    secondaryLight: "#c4b5fd",
    secondaryHover: "#6d28d9",
    accent: "#06b6d4",
    accentLight: "#67e8f9",
    accentHover: "#0891b2",
    success: "#16a34a",
    warning: "#f59e0b",
    highlight: "#a78bfa",
  },
  {
    name: "Dusk",
    primary: "#1e40af",
    primaryLight: "#60a5fa",
    primaryHover: "#1e3a8a",
    secondary: "#6b21a8",
    secondaryLight: "#a78bfa",
    secondaryHover: "#581c87",
    accent: "#0891b2",
    accentLight: "#67e8f9",
    accentHover: "#0e7490",
    success: "#15803d",
    warning: "#d97706",
    highlight: "#faf100",
  },
];

function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-light", theme.primaryLight);
  root.style.setProperty("--primary-hover", theme.primaryHover);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--secondary-light", theme.secondaryLight);
  root.style.setProperty("--secondary-hover", theme.secondaryHover);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-light", theme.accentLight);
  root.style.setProperty("--accent-hover", theme.accentHover);
  root.style.setProperty("--success", theme.success);
  root.style.setProperty("--warning", theme.warning);
  root.style.setProperty("--highlight", theme.highlight);
  root.style.setProperty("--dash-accent", theme.primary);
  root.style.setProperty("--dash-accent-light", theme.primaryLight);
  root.style.setProperty("--dash-accent-hover", theme.primaryHover);
  root.style.setProperty("--dash-secondary", theme.accent);
  root.style.setProperty("--dash-secondary-light", theme.accentLight);
  root.style.setProperty("--dash-secondary-hover", theme.accentHover);
  root.style.setProperty("--dash-cyan", theme.primary);
  root.style.setProperty("--dash-cyan-light", theme.primaryLight);
  root.style.setProperty("--dash-success", theme.success);
  root.style.setProperty("--dash-warning", theme.warning);
  root.style.setProperty("--dash-highlight", theme.highlight);
  root.style.setProperty("--link", theme.primaryLight);
}

function applyFontSize(percent) {
  const root = document.documentElement;
  root.style.fontSize = percent === 100 ? "" : `${percent}%`;
}

const POS_KEY = "yarnerylounge-theme-pos";
const THEME_KEY = "yarnerylounge-theme";
const FONT_KEY = "yarnerylounge-font-size";
const FAB_SIZE = 48;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const SIZE_STEP = 6;

export default function ThemePicker() {
  const [active, setActive] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = parseInt(localStorage.getItem(THEME_KEY), 10);
    return saved >= 0 && saved < THEMES.length ? saved : 0;
  });
  const [open, setOpen] = useState(false);
  const [fontPct, setFontPct] = useState(() => {
    if (typeof window === "undefined") return 100;
    const saved = parseInt(localStorage.getItem(FONT_KEY), 10);
    return saved >= 82 && saved <= 124 ? saved : 100;
  });
  const [pos, setPos] = useState(() => {
    if (typeof window === "undefined") return { right: 16, bottom: 96 };
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)) {
        return {
          right: clamp(saved.right, 4, Math.max(4, window.innerWidth - FAB_SIZE - 4)),
          bottom: clamp(saved.bottom, 76, Math.max(76, window.innerHeight - FAB_SIZE - 4)),
        };
      }
    } catch {
      /* use the default */
    }
    return { right: 16, bottom: 96 };
  });

  const dragRef = useRef(null);
  const movedRef = useRef(0);

  useEffect(() => {
    applyTheme(THEMES[active]);
  }, [active]);

  useEffect(() => {
    applyFontSize(fontPct);
  }, [fontPct]);

  const select = (idx) => {
    setActive(idx);
    applyTheme(THEMES[idx]);
    localStorage.setItem(THEME_KEY, idx.toString());
  };

  const revertToCommunity = () => {
    localStorage.removeItem(THEME_KEY);
    setActive(0);
    window.dispatchEvent(new Event("yarnery-theme-revert"));
  };

  const resize = (delta) => {
    const next = Math.min(124, Math.max(82, fontPct + delta));
    setFontPct(next);
    applyFontSize(next);
    localStorage.setItem(FONT_KEY, next.toString());
  };

  const resizeReset = () => {
    setFontPct(100);
    applyFontSize(100);
    localStorage.removeItem(FONT_KEY);
  };

  function onDragStart(e) {
    dragRef.current = { startX: e.x, startY: e.y, right: pos.right, bottom: pos.bottom };
    movedRef.current = 0;
    e.target.setPointerCapture?.(e.pointerId);
  }

  function onDragMove(e) {
    if (!dragRef.current) return;
    const dx = e.x - dragRef.current.startX;
    const dy = e.y - dragRef.current.startY;
    movedRef.current = Math.max(movedRef.current, Math.abs(dx) + Math.abs(dy));
    setPos({
      right: clamp(dragRef.current.right - dx, 4, Math.max(4, window.innerWidth - FAB_SIZE - 4)),
      bottom: clamp(dragRef.current.bottom - dy, 76, Math.max(76, window.innerHeight - FAB_SIZE - 4)),
    });
  }

  function onDragEnd(e) {
    if (!dragRef.current) return;
    e.target.releasePointerCapture?.(e.pointerId);
    const wasDrag = movedRef.current > 8;
    dragRef.current = null;
    if (wasDrag) {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
      return;
    }
    setOpen(!open);
  }

  return (
    <div style={{ position: "fixed", right: pos.right, bottom: pos.bottom, zIndex: 100, touchAction: "none" }}>
      <button
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        aria-label="Change theme"
        title="Theme & text size (drag to move)"
        style={{
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.18)",
          background: THEMES[active].primary,
          cursor: "grab",
          touchAction: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 6px 20px ${THEMES[active].primary}55`,
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
            background: "#1f1f1f",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16,
            padding: 16,
            width: 216,
            boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
            zIndex: 101,
          }}
        >
          <p style={{ margin: "0 0 4px", color: "#fff", fontSize: 13, fontWeight: 700 }}>
            Accent theme
          </p>
          <p style={{ margin: "0 0 10px", color: "#cfcfcf", fontSize: 11.5 }}>
            Tip: drag the round button anywhere on screen.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {THEMES.map((theme, idx) => (
              <button
                key={theme.name}
                type="button"
                onClick={() => select(idx)}
                aria-label={`Select ${theme.name} theme`}
                title={theme.name}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  border: idx === active ? "3px solid #fff" : "1px solid rgba(255,255,255,0.25)",
                  background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`,
                  cursor: "pointer",
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={revertToCommunity}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "7px 0",
              borderRadius: 9,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "#fff",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Use community theme
          </button>

          <p style={{ margin: "12px 0 2px", color: "#fff", fontSize: 13, fontWeight: 700 }}>
            Text size
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => resize(-SIZE_STEP)}
              aria-label="Decrease text size"
              style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#fff", fontSize: 15, cursor: "pointer" }}
            >
              A−
            </button>
            <span style={{ color: "#fff", fontSize: 12.5, minWidth: 42, textAlign: "center" }}>
              {fontPct}%
            </span>
            <button
              type="button"
              onClick={() => resize(SIZE_STEP)}
              aria-label="Increase text size"
              style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#fff", fontSize: 15, cursor: "pointer" }}
            >
              A+
            </button>
            <button
              type="button"
              onClick={resizeReset}
              aria-label="Reset text size"
              style={{ width: 52, height: 32, borderRadius: 9, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#fff", fontSize: 12, cursor: "pointer" }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}