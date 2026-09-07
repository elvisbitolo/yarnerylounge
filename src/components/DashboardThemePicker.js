"use client";

import { useState, useEffect, useRef } from "react";
import { useMembership } from "@/lib/membership";

const PRESETS = [
  { name: "Cream", bg: "#f7f1e9", surface: "#ffffff", border: "#eadfd2", text: "#171a33", muted: "#8a7c6f", accent: "#f42e79" },
  { name: "Linen", bg: "#fbf7f1", surface: "#ffffff", border: "#f0e8dd", text: "#0a0e2a", muted: "#9c8f82", accent: "#f42e79" },
  { name: "Blush", bg: "#faefe9", surface: "#ffffff", border: "#f0dfd4", text: "#3a2e28", muted: "#a08a78", accent: "#d81f66" },
  { name: "Sand", bg: "#f3eadf", surface: "#fffdf9", border: "#e7dccb", text: "#34302a", muted: "#8f8475", accent: "#f42e79" },
  { name: "Mist", bg: "#eef2f7", surface: "#ffffff", border: "#dde5ee", text: "#1d2433", muted: "#76808f", accent: "#f42e79" },
  { name: "Arctic", bg: "#f4f6fc", surface: "#ffffff", border: "#d8e0ec", text: "#1a2233", muted: "#5a6578", accent: "#f42e79" },
];

function Swatch({ color, size = 28 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 8,
      background: color, border: "1px solid #eadfd2",
      flexShrink: 0,
    }} />
  );
}

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <label style={{ flex: 1, fontSize: 12, color: "#8a7c6f", fontWeight: 500 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 32, height: 32, border: "none", borderRadius: 8, cursor: "pointer", background: "transparent", padding: 0 }}
        />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value); }}
        style={{
          width: 78, padding: "5px 8px", borderRadius: 8, border: "1px solid #eadfd2",
          background: "#ffffff", color: "#171a33", fontSize: 11, fontFamily: "monospace",
          outline: "none",
        }}
      />
    </div>
  );
}

export default function DashboardThemePicker() {
  const [open, setOpen] = useState(false);
  const [customTheme, setCustomTheme] = useState(null);
  const [panelPos, setPanelPos] = useState(null);
  const panelRef = useRef(null);
  const lastRect = useRef(null);
  const { membership, refresh } = useMembership();

  // The effective theme resolves reactively from the shared (cached)
  // MembershipProvider until the user customizes it — no effects needed.
  const theme = customTheme || membership?.theme || PRESETS[0];

  function clampPanel(rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxH = vw < 1024 ? Math.min(vh * 0.52, 440) : Math.min(vh * 0.7, 560);
    const width = Math.min(340, vw - 24);
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, vw - width - 8));
    let top = rect.bottom + 10;
    if (top + maxH > vh - 8) top = Math.max(8, rect.top - maxH - 10);
    return { left, top };
  }

  function togglePanel(e) {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    lastRect.current = rect;
    setPanelPos(clampPanel(rect));
    setOpen(true);
  }

  useEffect(() => {
    if (!theme) return;
    const r = document.documentElement;
    if (theme.bg) {
      r.style.setProperty("--background", theme.bg);
      r.style.setProperty("--dash-bg", theme.bg);
    }
    if (theme.surface) r.style.setProperty("--dash-surface", theme.surface);
    if (theme.border) r.style.setProperty("--dash-border", theme.border);
    if (theme.text) {
      r.style.setProperty("--foreground", theme.text);
      r.style.setProperty("--dash-text", theme.text);
    }
    if (theme.muted) r.style.setProperty("--dash-muted", theme.muted);
    if (theme.accent) r.style.setProperty("--dash-accent", theme.accent);
  }, [theme]);

  useEffect(() => {
    if (!open || !lastRect.current) return;
    function onResize() {
      setPanelPos(clampPanel(lastRect.current));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function applyPreset(preset) {
    setCustomTheme({ ...preset });
    save({ ...preset });
  }

  function updateColor(key, value) {
    setCustomTheme((prev) => {
      const next = { ...(prev || membership?.theme || PRESETS[0]), [key]: value };
      save(next);
      return next;
    });
  }

  function save(t) {
    fetch("/api/dashboard/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: t }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok) refresh();
      })
      .catch(() => {});
  }

  const compact = typeof window !== "undefined" && window.innerWidth < 1024;
  const panelMaxHeight = compact ? "min(52vh, 440px)" : "min(70vh, 560px)";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={togglePanel}
        title="Customize theme"
        aria-expanded={open}
        style={{
          width: 36, height: 36, borderRadius: 10, border: "1px solid #eadfd2",
          background: "#ffffff", color: "#8a7c6f", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#f42e79"; e.currentTarget.style.color = "#f42e79"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#eadfd2"; e.currentTarget.style.color = "#8a7c6f"; }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2a5 5 0 0 1 5 5c0 2-1 3-2 4l-1 1a1 1 0 0 0-.3.7V14a1 1 0 0 1-1 1h-1.4a1 1 0 0 0-.7.3l-.7.7a1 1 0 0 1-.7.3H9a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3z" />
          <circle cx="7.5" cy="11.5" r="1.5" fill="currentColor" />
          <circle cx="10" cy="8" r="1.5" fill="currentColor" />
          <circle cx="14" cy="8" r="1.5" fill="currentColor" />
          <circle cx="16.5" cy="11.5" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {open && panelPos && (
        <div ref={panelRef} style={{
          position: "fixed", left: panelPos.left, top: panelPos.top, zIndex: 200,
          width: "min(340px, calc(100vw - 24px))",
          maxHeight: panelMaxHeight, overflowY: "auto",
          background: "#ffffff", border: "1px solid #eadfd2", borderRadius: 16,
          padding: 18, boxShadow: "0 16px 48px rgba(9,12,38,0.16)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#171a33", marginBottom: 14, textAlign: "center" }}>
            Customize Dashboard
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7c6f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Presets
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 18 }}>
            {PRESETS.map((p) => {
              const isActive = theme.bg === p.bg && theme.surface === p.surface;
              return (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 10,
                    border: isActive ? "2px solid #f42e79" : "1px solid #eadfd2",
                    background: p.surface, cursor: "pointer",
                    boxShadow: isActive ? "0 0 0 1px rgba(244,46,121,0.25)" : "none",
                    transition: "border-color 0.15s",
                  }}
                >
                  <Swatch color={p.bg} size={18} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: p.text }}>{p.name}</span>
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7c6f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Custom Colors
          </div>
          <ColorRow label="Background" value={theme.bg} onChange={(v) => updateColor("bg", v)} />
          <ColorRow label="Surface / Cards" value={theme.surface} onChange={(v) => updateColor("surface", v)} />
          <ColorRow label="Borders" value={theme.border} onChange={(v) => updateColor("border", v)} />
          <ColorRow label="Text" value={theme.text} onChange={(v) => updateColor("text", v)} />
          <ColorRow label="Muted Text" value={theme.muted} onChange={(v) => updateColor("muted", v)} />
          <ColorRow label="Accent" value={theme.accent} onChange={(v) => updateColor("accent", v)} />

          <button
            onClick={() => applyPreset(PRESETS[0])}
            style={{
              width: "100%", marginTop: 12, padding: "8px 0", borderRadius: 10,
              border: "1px solid #eadfd2", background: "transparent",
              color: "#8a7c6f", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            Reset to Default
          </button>
        </div>
      )}
    </div>
  );
}
