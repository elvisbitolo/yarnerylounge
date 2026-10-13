"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import styles from "../chat.module.css";

// Forward a message into another conversation: the already-rendered (decrypted)
// text and attachment are posted through the same /messages endpoint used by
// the composer, so the recipient gets a regular message — with the normal mute
// and notification handling applied.
export default function ForwardPicker({ open, onClose, conversationId, messageId, msg }) {
  const [conversations, setConversations] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const initiatedRef = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    initiatedRef.current = false;
    let active = true;
    fetch("/api/conversations")
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't load conversations");
        const data = await res.json();
        if (!active) return;
        const list = Array.isArray(data.conversations) ? data.conversations : [];
        setConversations(list.filter((c) => c.id !== conversationId));
        setError("");
        setStatus("");
      })
      .catch(() => {
        if (active) setError("Couldn't load conversations. Try again.");
      });
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, conversationId, onClose]);

  if (!open) return null;

  const uniformConversations = conversations || [];

  async function forwardTo(targetId) {
    if (initiatedRef.current) return;
    initiatedRef.current = true;
    setError("");
    setStatus("Forwarding…");
    try {
      const body = { text: msg.text || "" };
      if (msg.attachment) {
        body.attachment = {
          kind: msg.attachment.kind,
          mime: msg.attachment.mime,
          name: msg.attachment.name,
          size: msg.attachment.size || 0,
          dataUrl: msg.attachment.dataUrl,
          durationMs: msg.attachment.durationMs,
          peaks: msg.attachment.peaks,
        };
      }
      const res = await fetch(`/api/conversations/${targetId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error || "Couldn't forward");
      }
      setStatus("Forwarded ✓");
      setTimeout(() => {
        onClose();
        setStatus("");
        setConversations(null);
      }, 700);
    } catch (err) {
      initiatedRef.current = false;
      setStatus("");
      setError(err.message || "Couldn't forward that message");
    }
  }

  return (
    <div className={styles.chatModalBackdrop} onClick={onClose}>
      <div
        className={styles.chatModal}
        role="dialog"
        aria-modal="true"
        aria-label="Forward message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.drawerHead}>
          <h2 className={styles.drawerTitle}>Forward message</h2>
          <button
            type="button"
            className={styles.iconToggle}
            onClick={onClose}
            aria-label="Close forward picker"
          >
            <X size={16} />
          </button>
        </div>
        <div className={styles.chatModalBody}>
          {error && <p className={styles.settingsNote}>{error}</p>}
          {!error && conversations === null && (
            <p className={styles.settingsNote}>Loading conversations…</p>
          )}
          {!error && conversations !== null && uniformConversations.length === 0 && (
            <p className={styles.settingsNote}>No other conversations to forward to.</p>
          )}
          {uniformConversations.map((conversation) => {
            const title = conversation.title || conversation.name || "Conversation";
            const initials = title.trim().charAt(0).toUpperCase() || "?";
            return (
              <button
                key={conversation.id}
                type="button"
                className={styles.forwardItem}
                onClick={() => forwardTo(conversation.id)}
                disabled={!!status}
              >
                <span
                  className={styles.forwardAvatar}
                  style={
                    conversation.photoURL
                      ? { backgroundImage: `url(${conversation.photoURL})` }
                      : undefined
                  }
                >
                  {!conversation.photoURL && initials}
                </span>
                <span className={styles.forwardTitle}>
                  {title}
                  {conversation.type === "dm" && (
                    <span className={styles.forwardType}>· DM</span>
                  )}
                </span>
                <Send size={15} className={styles.forwardSend} aria-hidden="true" />
              </button>
            );
          })}
          {status && (
            <p className={styles.forwardStatus}>
              <Send size={13} aria-hidden="true" /> {status}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}