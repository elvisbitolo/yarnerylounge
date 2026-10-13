"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArrowLeft, Bell, Pin, Search, ShieldBan, Star, X } from "lucide-react";
import { MUTE_DURATIONS, muteSelectionFromPrefs } from "@/lib/chat-settings-core";
import { rawPrefsFor, resolvedPrefs, saveConversationPrefs } from "@/lib/chat-prefs-store";
import { setStarred } from "@/lib/chat-star-store";
import { useAppearance, saveChatAppearance, appearanceForConversation } from "@/lib/chat-appearance-store";
import WallpaperPicker from "../WallpaperPicker";
import { chatFullTimeLabel } from "@/lib/chat-time";
import styles from "../chat.module.css";

// The per-chat info drawer, opened from the thread header. It mirrors
// WhatsApp's chat info: mute with a duration, pin to top, archive, search the
// messages, and (for DMs) block the other member. All of it lives in the
// viewer's own prefs, so it only touches their side of the conversation.
export default function ChatInfo({
  open,
  onClose,
  conversationId,
  title,
  photoURL,
  isDm = false,
  otherMemberId = "",
  onOpenSearch,
  onOpenMessage,
}) {
  const [prefs, setPrefsState] = useState(() => resolvedPrefs(conversationId));
  const [muteKey, setMuteKey] = useState(() => muteSelectionFromPrefs(rawPrefsFor(conversationId)));
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [starredList, setStarredList] = useState(null);
  const appearance = useAppearance();

  async function loadStarred() {
    setStarredList(null);
    try {
      const res = await fetch(`/api/chat/starred?conversationId=${encodeURIComponent(conversationId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setStarredList(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setStarredList([]);
    }
  }

  const loadStarredStable = useCallback(loadStarred, [conversationId]);

  async function removeStar(messageId) {
    setStarredList((rows) => (rows || []).filter((row) => row.id !== messageId));
    setStarred(conversationId, messageId, false);
    try {
      const res = await fetch("/api/chat/starred", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, messageId, starred: false }),
      });
      if (!res.ok) {
        setStarred(conversationId, messageId, true);
        await loadStarred();
      }
    } catch {
      setStarred(conversationId, messageId, true);
      await loadStarred();
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const current = resolvedPrefs(conversationId);
    setPrefsState(current);
    setMuteKey(muteSelectionFromPrefs(rawPrefsFor(conversationId)));
    setBusy(false);
    loadStarredStable();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, conversationId, onClose, loadStarredStable]);

  if (!open) return null;

  const initials = (title || "?").trim().charAt(0).toUpperCase() || "?";

  async function patch(patch) {
    setBusy(true);
    try {
      const saved = await saveConversationPrefs(conversationId, patch);
      if (!saved) return;
      setPrefsState(resolvedPrefs(conversationId));
      if (typeof patch.muted === "string") setMuteKey(patch.muted);
    } finally {
      setBusy(false);
    }
  }

  async function setMute(value) {
    await patch({ muted: value });
  }

  async function togglePin() {
    await patch({ pinned: !prefs.pinned });
  }

  async function toggleArchive() {
    const willArchive = !prefs.archived;
    const saved = await saveConversationPrefs(conversationId, { archived: willArchive });
    if (saved) {
      setPrefsState(resolvedPrefs(conversationId));
      if (willArchive) onClose();
    }
  }

  async function blockMember() {
    if (!otherMemberId) return;
    if (!window.confirm("Block this member? They won't be able to reach you in chat.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/members/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "block", targetId: otherMemberId }),
      });
      if (res.ok) setBlocked(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.drawerBackdrop} onClick={onClose}>
      <div
        className={styles.settingsDrawer}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} info`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.drawerHead}>
          <h2 className={styles.drawerTitle}>Chat info</h2>
          <button
            type="button"
            className={styles.iconToggle}
            onClick={onClose}
            aria-label="Close chat info"
          >
            <X size={17} />
          </button>
        </div>

        <div className={styles.settingsBody}>
          <div className={styles.infoIdentity}>
            <span
              className={styles.infoAvatar}
              style={photoURL ? { backgroundImage: `url(${photoURL})` } : undefined}
            >
              {!photoURL && initials}
            </span>
            <span className={styles.infoName}>{title || "Member"}</span>
          </div>

          <section className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Notifications</h3>
            <div className={styles.settingsRow}>
              <span className={styles.settingsIcon}>
                <Bell size={16} aria-hidden="true" />
              </span>
              <span className={styles.settingsLabelWrap}>
                <span className={styles.settingsLabel}>Mute</span>
                {muteKey !== "off" ? (
                  <span className={styles.settingsHint}>
                    {muteKey === "always"
                      ? "Muted until you turn it off"
                      : `Muted for ${muteKey === "1h" ? "1 hour" : "8 hours"}`}
                  </span>
                ) : null}
              </span>
            </div>
            <div className={styles.muteOptions} role="radiogroup" aria-label="Mute duration">
              {MUTE_DURATIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={muteKey === value}
                  className={`${styles.muteOption} ${muteKey === value ? styles.muteOptionActive : ""}`}
                  onClick={() => setMute(value)}
                  disabled={busy}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Conversation</h3>
            <div className={styles.settingsRow}>
              <span className={styles.settingsIcon}>
                <Pin size={16} aria-hidden="true" />
              </span>
              <span className={styles.settingsLabelWrap}>
                <span className={styles.settingsLabel}>Pin to top</span>
                <span className={styles.settingsHint}>Keep this chat above the others</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.pinned}
                aria-label="Pin to top"
                className={`${styles.toggle} ${prefs.pinned ? styles.toggleOn : ""}`}
                onClick={togglePin}
                disabled={busy}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.settingsRow}>
              <span className={styles.settingsIcon}>
                <Archive size={16} aria-hidden="true" />
              </span>
              <span className={styles.settingsLabelWrap}>
                <span className={styles.settingsLabel}>Archived</span>
                <span className={styles.settingsHint}>
                  Hide from the list, keep the conversation
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.archived}
                aria-label="Archive conversation"
                className={`${styles.toggle} ${prefs.archived ? styles.toggleOn : ""}`}
                onClick={toggleArchive}
                disabled={busy}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <button
              type="button"
              className={styles.settingsActionRow}
              onClick={() => {
                onClose();
                onOpenSearch();
              }}
            >
              <span className={styles.settingsIcon}>
                <Search size={16} aria-hidden="true" />
              </span>
              <span className={styles.settingsActionLabel}>Search this conversation</span>
              <ArrowLeft size={15} className={styles.settingsActionArrow} aria-hidden="true" />
            </button>
          </section>

          <section className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Chat wallpaper</h3>
            <p className={styles.settingsNote}>
              Set a background just for this chat. Pick Default to use your
              Chat settings choice.
            </p>
            <WallpaperPicker
              value={appearanceForConversation(appearance, conversationId)}
              customUrl={appearance.customWallpaper}
              onPick={(wallpaper) => saveChatAppearance({ conversationId, wallpaper })}
            />
          </section>

          <section className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Starred</h3>
            {starredList === null ? (
              <p className={styles.settingsNote}>Loading…</p>
            ) : starredList.length === 0 ? (
              <p className={styles.settingsNote}>
                Nothing starred yet. Use the ⭐ on a message to bookmark it here.
              </p>
            ) : (
              <div className={styles.starredList}>
                {starredList.map((row) => (
                  <div key={row.id} className={styles.starredItem}>
                    <button
                      type="button"
                      className={styles.starredRow}
                      onClick={() => onOpenMessage && onOpenMessage(row.id)}
                    >
                      <span className={styles.starredSender}>{row.senderName}</span>
                      <span className={styles.starredText}>
                        {row.text ||
                          (row.attachment?.kind === "image"
                            ? "📷 photo"
                            : row.attachment?.kind === "audio"
                              ? "🎤 voice note"
                              : row.attachment?.name
                                ? `📎 ${row.attachment.name}`
                                : "…")}
                      </span>
                      <span className={styles.starredTime}>{chatFullTimeLabel(row.starredAt || row.createdAt)}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.starredRemove}
                      aria-label="Remove star"
                      onClick={() => removeStar(row.id)}
                    >
                      <Star size={13} fill="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {isDm && otherMemberId && (
            <section className={styles.settingsSection}>
              <h3 className={styles.settingsSectionTitle}>Privacy &amp; safety</h3>
              <button
                type="button"
                className={styles.settingsActionRow}
                onClick={blockMember}
                disabled={busy || blocked}
              >
                <span className={styles.settingsIcon}>
                  <ShieldBan size={16} aria-hidden="true" />
                </span>
                <span className={styles.settingsActionLabel}>
                  {blocked ? "Member blocked" : "Block member"}
                </span>
                <span className={styles.settingsActionArrow} aria-hidden="true" />
              </button>
              {blocked && <p className={styles.settingsNote}>Blocked members can&rsquo;t message you.</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}