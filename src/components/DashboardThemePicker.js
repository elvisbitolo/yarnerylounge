"use client";

import { useState, useRef } from "react";
import ThemePanel from "@/components/ThemePanel";

export default function DashboardThemePicker() {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState(null);
  const panelRef = useRef(null);
  const lastRect = useRef(null);

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

  function close(e) {
    if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
  }

  function onKey(e) {
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={togglePanel}
        title="Customize theme"
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          border: "1px solid #eadfd2",
          background: "#ffffff",
          color: "#8a7c6f",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#f42e79";
          e.currentTarget.style.color = "#f42e79";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "#eadfd2";
          e.currentTarget.style.color = "#8a7c6f";
        }}
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
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Customize dashboard theme"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: panelPos.left,
            top: panelPos.top,
            zIndex: 200,
            width: "min(340px, calc(100vw - 24px))",
            maxHeight: "min(70vh, 560px)",
            overflowY: "auto",
            background: "#1c1c1c",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 16,
            padding: 18,
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4, textAlign: "center" }}>
            Customize Dashboard
          </div>
          <p style={{ margin: "0 0 14px", color: "#cfcfcf", fontSize: 11.5, textAlign: "center" }}>
            Colours apply across the whole site.
          </p>
          <ThemePanel />
        </div>
      )}

      {open && (
        <style>{`body { cursor: default; }`}</style>
      )}

      {/* Close on outside click / Escape */}
      {open && typeof document !== "undefined" && (
        <div
          onClick={close}
          onKeyDown={onKey}
          role="presentation"
          style={{ position: "fixed", inset: 0, zIndex: 199 }}
        />
      )}
    </div>
  );
}