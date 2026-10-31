"use client";

import { useEffect, useState } from "react";
import styles from "./member-safety-controls.module.css";

export default function MemberSafetyControls({ targetId, targetName }) {
  const [iBlocked, setIBlocked] = useState(false);
  const [theyBlocked, setTheyBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/members/safety?targetId=${encodeURIComponent(targetId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        setIBlocked(Boolean(data.iBlocked));
        setTheyBlocked(Boolean(data.theyBlocked));
        setMuted(Boolean(data.muted));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [targetId]);

  async function change(action) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/members/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update preference");
      setIBlocked(Boolean(data.iBlocked));
      setTheyBlocked(Boolean(data.theyBlocked));
      setMuted(Boolean(data.muted));
      setMessage(action.startsWith("block")
        ? (data.iBlocked ? "Member blocked" : "Member unblocked")
        : (data.muted ? "Member muted" : "Member unmuted"));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function report(event) {
    event.preventDefault();
    if (!reason.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "member", targetId, reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not submit report");
      setReason("");
      setReportOpen(false);
      setMessage("Report submitted");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.controls}>
      <button type="button" role="menuitem" className={styles.actionButton}
        aria-pressed={iBlocked} onClick={() => change(iBlocked ? "unblock" : "block")} disabled={busy}>
        {iBlocked ? "Unblock member" : "Block member"}
      </button>
      <button type="button" role="menuitem" className={styles.actionButton}
        aria-pressed={muted} onClick={() => change(muted ? "unmute" : "mute")} disabled={busy}>
        {muted ? "Unmute member" : "Mute member"}
      </button>
      <button type="button" role="menuitem" className={styles.actionButton}
        aria-expanded={reportOpen} onClick={() => setReportOpen((open) => !open)} disabled={busy}>
        {reportOpen ? "Cancel report" : "Report member"}
      </button>
      {theyBlocked && (
        <p role="status" className={`${styles.notice} ${styles.warning}`}>
          This member blocked you, so they can&apos;t see your messages.
        </p>
      )}
      {reportOpen && (
        <form onSubmit={report} className={styles.reportForm}>
          <label className={styles.reportField}>
            <span className="sr-only">Reason for reporting {targetName}</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)}
              maxLength={500} required rows={3} placeholder="Tell moderators what happened"
              className={styles.reportTextarea} />
          </label>
          <button type="submit" className={styles.actionButton}
            disabled={busy || !reason.trim()}>Send report</button>
        </form>
      )}
      {message && <p role="status" className={styles.notice}>{message}</p>}
    </div>
  );
}
