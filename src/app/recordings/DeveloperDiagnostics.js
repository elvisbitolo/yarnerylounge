"use client";

import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";
import styles from "./recordings.module.css";

function display(value) {
  if (value == null || value === "") return "Not available";
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) {
    return new Date(value).toLocaleString();
  }
  return String(value);
}

export default function DeveloperDiagnostics({ recordingId, panelId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/recordings/" + encodeURIComponent(recordingId) + "/diagnostics", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json?.ok) throw new Error(json?.error || "Could not load diagnostics");
        if (alive) setData(json.data);
      })
      .catch((err) => { if (alive) setError(err.message || "Could not load diagnostics"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [recordingId]);

  async function copy(value) {
    try { await navigator.clipboard.writeText(String(value)); }
    catch { setError("Clipboard access was unavailable."); }
  }

  const fields = [
    ["Recording ID", "id"], ["Initiator ID", "initiatorId"], ["Room ID", "roomId"],
    ["Room name", "roomName"], ["JaaS session ID", "jaasSessionId"],
    ["JaaS recording ID", "jaasRecordingId"], ["Status", "status"],
    ["Storage bucket", "storageBucket"], ["Storage path", "storagePath"],
    ["Thumbnail path", "thumbnailPath"], ["Transcript path", "transcriptPath"],
    ["File size (bytes)", "sizeBytes"], ["Duration (seconds)", "durationSec"],
    ["Ingestion attempts", "attempts"], ["Source expires", "sourceExpiresAt"],
    ["Retrieved at", "pulledAt"], ["Created at", "createdAt"], ["Updated at", "updatedAt"],
    ["Last error", "lastError"], ["Error code", "errorCode"]
  ];

  return (
    <section id={panelId} className={styles.diagnosticsPanel} aria-label="Developer recording diagnostics">
      <div className={styles.diagnosticsHeader}>
        <div>
          <p className={styles.diagnosticsEyebrow}>Restricted developer view</p>
          <h3 className={styles.diagnosticsTitle}>Recording diagnostics</h3>
        </div>
        <button type="button" className={styles.diagnosticsClose} onClick={onClose} aria-label="Close diagnostics"><X size={18} /></button>
      </div>
      {loading ? <p className={styles.diagnosticsMessage}>Loading technical details…</p> : null}
      {error ? <p className={styles.diagnosticsError} role="alert">{error}</p> : null}
      {data ? (
        <>
          <div className={styles.diagnosticsSummary}>
            <span><strong>{data.status || "Unknown"}</strong><small>Pipeline status</small></span>
            <span><strong>{display(data.sizeBytes)}</strong><small>File size (bytes)</small></span>
            <span><strong>{display(data.durationSec)}</strong><small>Duration (seconds)</small></span>
          </div>
          <dl className={styles.diagnosticsList}>
            {fields.map(([label, key]) => data[key] != null && data[key] !== "" ? (
              <div className={styles.diagnosticsRow} key={key}>
                <dt>{label}</dt>
                <dd>{display(data[key])}
                  <button type="button" onClick={() => copy(data[key])} aria-label={"Copy " + label}><Copy size={13} /></button>
                </dd>
              </div>
            ) : null)}
          </dl>
          <p className={styles.diagnosticsFootnote}>Sensitive provider credentials and source download links are never displayed here.</p>
        </>
      ) : null}
    </section>
  );
}
