"use client";

import { CHAT_ACCENTS } from "@/lib/chat-appearance-core";
import styles from "./chat.module.css";

// WhatsApp-style accent-color grid for the chat surface (bubbles, names,
// reactions, links). Every offered color is curated so the near-white bubble
// text stays readable on it — see chat-appearance-core.
export default function AccentPicker({ value = null, onPick = () => {} }) {
  return (
    <div className={styles.wallpaperGrid} role="radiogroup" aria-label="Chat accent color">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        title="Default"
        className={`${styles.wallpaperTile} ${
          value === null ? styles.wallpaperTileActive : ""
        }`}
        onClick={() => onPick(null)}
      >
        <span
          className={styles.wallpaperChip}
          style={{ background: "var(--primary)" }}
          aria-hidden="true"
        />
        <span className={styles.wallpaperTileText}>Default</span>
      </button>
      {CHAT_ACCENTS.map((accent) => (
        <button
          key={accent.id}
          type="button"
          role="radio"
          aria-checked={value === accent.id}
          aria-label={accent.label}
          title={accent.label}
          className={`${styles.wallpaperTile} ${
            value === accent.id ? styles.wallpaperTileActive : ""
          }`}
          onClick={() => onPick(accent.id)}
        >
          <span
            className={styles.wallpaperChip}
            style={{ background: accent.color }}
            aria-hidden="true"
          />
          <span className={styles.wallpaperTileText}>{accent.label}</span>
        </button>
      ))}
    </div>
  );
}