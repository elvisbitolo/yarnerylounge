"use client";

import { useEffect, useState } from "react";
import { CheckCheck, Clock, X } from "lucide-react";
import { chatFullTimeLabel } from "@/lib/chat-time";
import styles from "../chat.module.css";

// WhatsApp-style "message info": sent time plus, for your own messages with
// read receipts on, who has read them and when. Everything is fetched from the
// server so reader names are accurate.
export default function MessageInfo({ open, onClose, conversationId, messageId }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !messageId) return undefined;
    let active = true;
    fetch(`/api/chat/messages/${messageId}/info?conversationId=${encodeURIComponent(conversationId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        if (!active) return;
        setInfo(data);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      });
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, conversationId, messageId, onClose]);

  if (!open) return null;

  return (
    <div className={styles.chatModalBackdrop} onClick={onClose}>
      <div
        className={styles.chatModal}
        role="dialog"
        aria-modal="true"
        aria-label="Message info"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.drawerHead}>
          <h2 className={styles.drawerTitle}>Message info</h2>
          <button
            type="button"
            className={styles.iconToggle}
            onClick={onClose}
            aria-label="Close message info"
          >
            <X size={16} />
          </button>
        </div>
        <div className={styles.chatModalBody}>
          {error && <p className={styles.settingsNote}>This message could not be found.</p>}
          {!error && !info && <p className={styles.settingsNote}>Loading…</p>}
          {!!info && (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoRowIcon}>
                  <Clock size={15} aria-hidden="true" />
                </span>
                <span className={styles.infoRowLabel}>Sent</span>
                <span className={styles.infoRowValue}>{chatFullTimeLabel(info.sentAt)}</span>
              </div>
              {info.mine ? (
                info.readers.length > 0 ? (
                  <>
                    <div className={styles.infoRow}>
                      <span className={styles.infoRowIcon}>
                        <CheckCheck size={15} aria-hidden="true" />
                      </span>
                      <span className={styles.infoRowLabel}>Delivered</span>
                      <span className={styles.infoRowValue}>{chatFullTimeLabel(info.sentAt)}</span>
                    </div>
                    <div className={styles.infoReadersHead}>Read</div>
                    {info.readers.map((reader) => (
                      <div key={reader.uid} className={styles.infoRow}>
                        <span className={styles.infoRowLabelEmpty} />
                        <span className={styles.infoReaderName}>{reader.name}</span>
                        <span className={styles.infoRowValue}>{chatFullTimeLabel(reader.readAt)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className={styles.infoRow}>
                    <span className={styles.infoRowIcon}>
                      <CheckCheck size={15} aria-hidden="true" />
                    </span>
                    <span className={styles.infoRowLabel}>Delivered</span>
                    <span className={styles.infoRowValue}>Not read yet</span>
                  </div>
                )
              ) : (
                <div className={styles.infoRow}>
                  <span className={styles.infoRowIcon}>
                    <CheckCheck size={15} aria-hidden="true" />
                  </span>
                  <span className={styles.infoRowLabel}>Receipts</span>
                  <span className={styles.infoRowValue}>Visible to the sender only</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}