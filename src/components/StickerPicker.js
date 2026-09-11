"use client";

import { useState, useEffect } from "react";
import { PartyPopper } from "lucide-react";

const STICKERS = [
  { type: "trophy", emoji: "🏆", label: "Trophy" },
  { type: "star", emoji: "⭐", label: "Star" },
  { type: "yarn", emoji: "🧶", label: "Yarn Ball" },
  { type: "heart", emoji: "❤️", label: "Heart" },
  { type: "celebration", emoji: "🎉", label: "Celebration" },
  { type: "clap", emoji: "👏", label: "Clap" },
];

export default function StickerPicker({ toUid, toName, onSent }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState("");

  async function sendSticker(type) {
    setError("");
    setSent(null);
    const res = await fetch("/api/stickers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUid, type }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to send");
      return;
    }
    setSent(type);
    setOpen(false);
    if (typeof onSent === "function") onSent(type);
    setTimeout(() => setSent(null), 2500);
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "8px 14px",
          borderRadius: 10,
          border: "1px solid #eadfd2",
          background: "#ffffff",
          color: "#171a33",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
      >
        <PartyPopper size={14} /> Send sticker
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 50,
            background: "#ffffff",
            border: "1px solid #eadfd2",
            borderRadius: 14,
            padding: "10px 12px",
            boxShadow: "0 12px 32px rgba(9,12,38,0.14)",
            display: "flex",
            gap: 6,
          }}
        >
          {STICKERS.map((s) => (
            <button
              key={s.type}
              onClick={() => sendSticker(s.type)}
              title={s.label}
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                border: "none",
                background: "#f7f1e9",
                fontSize: 22,
                cursor: "pointer",
                transition: "background 0.15s ease, transform 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(244,46,121,0.15)";
                e.currentTarget.style.transform = "scale(1.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#f7f1e9";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {s.emoji}
            </button>
          ))}
        </div>
      )}

      {sent && (
        <span style={{
          marginLeft: 10,
          fontSize: 13,
          fontWeight: 600,
          color: "#d81f66",
        }}>
          Sent {STICKERS.find((s) => s.type === sent)?.emoji} to {toName}!
        </span>
      )}
      {error && (
        <span style={{
          marginLeft: 10,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--error)",
        }}>
          {error}
        </span>
      )}
    </div>
  );
}
