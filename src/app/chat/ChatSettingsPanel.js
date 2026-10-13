"use client";

import { useEffect } from "react";
import { Eye, EyeOff, Palette, Type, Volume2, X } from "lucide-react";
import { saveChatSettings, useChatPrefs } from "@/lib/chat-prefs-store";
import { setTypingHidden } from "@/lib/chat-typing-core";
import { useAppearance, saveChatAppearance } from "@/lib/chat-appearance-store";
import WallpaperPicker from "./WallpaperPicker";
import styles from "./chat.module.css";

function Toggle({ checked, onChange, icon: Icon, label, hint }) {
  return (
    <div className={styles.settingsRow}>
      <span className={styles.settingsIcon}>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      </span>
      <span className={styles.settingsLabelWrap}>
        <span className={styles.settingsLabel}>{label}</span>
        {hint ? <span className={styles.settingsHint}>{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.toggleKnob} />
      </button>
    </div>
  );
}

// The global Chat settings drawer (gear in the rail header): the privacy +
// notification toggles that apply across every conversation. Writes go to the
// server via the settings API; the shared prefs store mirrors the result.
export default function ChatSettingsPanel({ open, onClose }) {
  const { settings } = useChatPrefs();
  const appearance = useAppearance();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function patch(key, value) {
    const updated = await saveChatSettings({ [key]: value });
    if (updated && key === "typingHidden") setTypingHidden(value === true);
  }

  return (
    <div className={styles.drawerBackdrop} onClick={onClose}>
      <div
        className={styles.settingsDrawer}
        role="dialog"
        aria-modal="true"
        aria-label="Chat settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.drawerHead}>
          <h2 className={styles.drawerTitle}>Chat settings</h2>
          <button
            type="button"
            className={styles.iconToggle}
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={17} />
          </button>
        </div>

        <div className={styles.settingsBody}>
          <section className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Privacy</h3>
            <Toggle
              checked={settings.readReceipts !== false}
              onChange={(value) => patch("readReceipts", value)}
              icon={Eye}
              label="Read receipts"
              hint="Show when your chat partners have read your messages"
            />
            <Toggle
              checked={settings.typingHidden === true}
              onChange={(value) => patch("typingHidden", value)}
              icon={Type}
              label="Typing indicator"
              hint={'Show a "typing…" line while you write'}
            />
            <div className={styles.settingsRow}>
              <span className={styles.settingsIcon}>
                <EyeOff size={16} aria-hidden="true" />
              </span>
              <span className={styles.settingsLabelWrap}>
                <span className={styles.settingsLabel}>Online presence</span>
                <span className={styles.settingsHint}>
                  Who can see when you&rsquo;re online
                </span>
              </span>
              <div className={styles.segmentGroup} role="radiogroup" aria-label="Online presence">
                {["everyone", "nobody"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={settings.onlineVisibility === key}
                    className={`${styles.segmentBtn} ${
                      settings.onlineVisibility === key ? styles.segmentBtnActive : ""
                    }`}
                    onClick={() => patch("onlineVisibility", key)}
                  >
                    {key === "everyone" ? "Everyone" : "Nobody"}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Notifications</h3>
            <Toggle
              checked={settings.messageSound !== false}
              onChange={(value) => patch("messageSound", value)}
              icon={Volume2}
              label="Message sounds"
              hint="Play a soft chime for new messages"
            />
          </section>

          <section className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Appearance</h3>
            <div className={styles.settingsRow}>
              <span className={styles.settingsIcon}>
                <Palette size={16} aria-hidden="true" />
              </span>
              <span className={styles.settingsLabelWrap}>
                <span className={styles.settingsLabel}>Chat wallpaper</span>
                <span className={styles.settingsHint}>
                  A background for every conversation. Override per chat from
                  its info panel.
                </span>
              </span>
            </div>
            <WallpaperPicker
              value={appearance.wallpaper}
              customUrl={appearance.customWallpaper}
              showUpload
              onPick={(wallpaper) => saveChatAppearance({ wallpaper })}
              onUpload={(customWallpaper) => saveChatAppearance({ customWallpaper })}
            />
          </section>

          <p className={styles.settingsNote}>
            Mute a specific chat from its info panel. Blocked members stay
            hidden everywhere.
          </p>
        </div>
      </div>
    </div>
  );
}