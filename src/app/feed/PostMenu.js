"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

// A small click-outside dropdown used for the per-post action menu. Items are
// plain objects so each render can decide what the viewer is allowed to do
// (author vs moderator vs trash view) without the menu knowing anything.
export default function PostMenu({ items = [], title = "More", label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const visible = items.filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!visible.length) return null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          border: "1px solid var(--border, #e5e7eb)",
          background: "transparent",
          borderRadius: 8,
          padding: "4px 8px",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
        <MoreHorizontal size={15} />
        {label ? <span>{label}</span> : null}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 40,
            minWidth: 190,
            background: "var(--surface, #fff)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            padding: 6,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                border: 0,
                background: "transparent",
                borderRadius: 7,
                padding: "8px 10px",
                cursor: "pointer",
                font: "inherit",
                fontSize: 14,
                color: item.danger ? "#dc2626" : "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--surface-2, #f3f4f6)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
