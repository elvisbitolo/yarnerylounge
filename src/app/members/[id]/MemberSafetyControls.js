"use client";

import { useEffect, useState } from "react";

export default function MemberSafetyControls({ targetId, targetName }) {
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/members/safety?targetId=${encodeURIComponent(targetId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) { setBlocked(Boolean(data.blocked)); setMuted(Boolean(data.muted)); }
      })
      .catch(() => {});
  }, [targetId]);

  async function change(action) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/members/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update preference");
      setBlocked(Boolean(data.blocked)); setMuted(Boolean(data.muted));
      setMessage(action.startsWith("block") ? (data.blocked ? "Member blocked" : "Member unblocked") : (data.muted ? "Member muted" : "Member unmuted"));
    } catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  }

  async function report(event) {
    event.preventDefault();
    if (!reason.trim() || busy) return;
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "member", targetId, reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not submit report");
      setReason(""); setReportOpen(false); setMessage("Report submitted");
    } catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 }}>
      <button type="button" onClick={() => change(blocked ? "unblock" : "block")} disabled={busy} style={buttonStyle(blocked)}>
        {blocked ? "Unblock" : "Block"}
      </button>
      <button type="button" onClick={() => change(muted ? "unmute" : "mute")} disabled={busy} style={buttonStyle(muted)}>
        {muted ? "Unmute" : "Mute"}
      </button>
      <button type="button" onClick={() => setReportOpen((open) => !open)} disabled={busy} style={buttonStyle(false)}>Report</button>
      {reportOpen && (
        <form onSubmit={report} style={{ flexBasis: "100%", display: "flex", gap: 8, alignItems: "flex-start", marginTop: 4 }}>
          <label style={{ flex: 1 }}>
            <span className="sr-only">Reason for reporting {targetName}</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required rows={2} placeholder="Tell moderators what happened" style={{ width: "100%", padding: 8, border: "1px solid #d9cbc4", borderRadius: 8, resize: "vertical" }} />
          </label>
          <button type="submit" disabled={busy || !reason.trim()} style={buttonStyle(false)}>Send</button>
        </form>
      )}
      {message && <span role="status" style={{ flexBasis: "100%", color: "#756a68", fontSize: 12 }}>{message}</span>}
    </div>
  );
}

function buttonStyle(active) {
  return { height: 34, padding: "0 13px", borderRadius: 999, border: "1px solid #d9cbc4", background: active ? "#fff0f6" : "#fff", color: active ? "#9e1654" : "#51464e", fontSize: 12, fontWeight: 700, cursor: "pointer" };
}
