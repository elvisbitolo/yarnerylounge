"use client";

import { useEffect, useState } from "react";
import useDraggableFloat from "@/lib/use-draggable-float";
import ThemePanel from "@/components/ThemePanel";

const POS_KEY = "yarnerylounge-theme-pos";
const FAB_SIZE = 48;
const FAB_COLOR = "#b6b1a4";

const V = {
  text: "var(--text, #f2f2f2)",
  muted: "var(--muted, #9a9a9a)",
  surface: "var(--surface, #111111)",
  border: "var(--border, #27272a)",
  primary: "var(--primary, #e91e63)",
};

export default function ThemePicker() {
  const [open, setOpen] = useState(false);
  const drag = useDraggableFloat({
    storageKey: POS_KEY,
    defaultPos: { right: 16, bottom: 96 },
    width: FAB_SIZE,
    height: FAB_SIZE,
    minBottom: 76,
  });

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function handleToggleClick() {
    if (drag.wasDragged()) return;
    setOpen((prev) => !prev);
  }

  return (
    <div style={{ ...drag.style, right: drag.pos.right }}>
      <button
        {...drag.handlers}
        onClick={handleToggleClick}
        aria-label={open ? "Close theme customizer" : "Open theme customizer"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Drag to move · click to customize theme"
        style={{
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: "50%",
          border: `2px solid ${V.border}`,
          background: FAB_COLOR,
          cursor: "grab",
          touchAction: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 6px 20px ${FAB_COLOR}55`,
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
          onClick={() => setOpen(false)}
          role="presentation"
          style={{ position: "fixed", inset: 0, zIndex: 1000 }}
        />
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Customize theme"
          style={{
            position: "absolute",
            bottom: FAB_SIZE + 8,
            right: 0,
            zIndex: 1001,
            background: V.surface,
            border: `1px solid ${V.border}`,
            borderRadius: 16,
            padding: 16,
            width: 240,
            maxHeight: "min(70vh, 560px)",
            overflowY: "auto",
            boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          }}
        >
          <p style={{ margin: "0 0 10px", color: V.text, fontSize: 13, fontWeight: 700 }}>
            Customize theme
          </p>
          <p style={{ margin: "0 0 12px", color: V.muted, fontSize: 11.5 }}>
            Choose a preset or pick your own colours — they apply across the whole site.
          </p>
          <ThemePanel />
        </div>
      )}
    </div>
  );
}