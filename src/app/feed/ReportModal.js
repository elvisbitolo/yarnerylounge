"use client";

import { useState } from "react";
import styles from "./feed.module.css";

const REASONS = [
  "Spam",
  "Harassment or bullying",
  "Hateful content",
  "Misinformation",
  "Explicit content",
  "Other",
];

export default function ReportModal({ type, targetId, commentPostId, roomId, onClose }) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const finalReason = reason === "Other" ? other.trim() : reason;
    if (!finalReason) {
      setError("Tell us what's wrong so a moderator can review it.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetId, commentPostId, roomId, reason: finalReason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Report failed");
      }
      setSent(true);
    } catch (err) {
      setError(err.message || "Report failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Report this content"
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <>
            <h3 className={styles.modalTitle}>Thanks for letting us know</h3>
            <p className={styles.modalText}>A moderator will review this and take action if needed.</p>
            <button className={styles.modalButton} onClick={onClose} autoFocus>
              Close
            </button>
          </>
        ) : (
          <>
            <h3 className={styles.modalTitle}>Report this content</h3>
            <p className={styles.modalText}>What&apos;s the issue?</p>
            <form onSubmit={handleSubmit}>
              <div className={styles.modalOptions}>
                {REASONS.map((r) => (
                  <label key={r} className={styles.modalOption}>
                    <input
                      type="radio"
                      name="reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
              {reason === "Other" && (
                <textarea
                  className={styles.reportTextarea}
                  rows={3}
                  placeholder="Describe the issue…"
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                />
              )}
              {error && <p className={styles.reportError}>{error}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalCancel} onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className={styles.modalButton} disabled={busy}>
                  {busy ? "Submitting…" : "Submit report"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
