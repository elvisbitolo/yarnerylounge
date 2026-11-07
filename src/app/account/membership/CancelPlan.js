"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../account.module.css";

export default function CancelPlan({ planLabel }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  async function cancel() {
    if (busy || !window.confirm(`Cancel your ${planLabel} plan now? Paid access will end immediately and your account will move to the free Flirting tier.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/membership/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Cancellation failed.");
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err.message || "We could not cancel your plan. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className={styles.formSaved} role="status">Your paid plan is canceled. Paid access has ended immediately; you are now on the free Flirting tier.</p>;
  }

  return (
    <div className={styles.cancelPlan}>
      <div>
        <h3 className={styles.cancelTitle}>Cancel paid plan</h3>
        <p className={styles.cancelCopy}>Cancellation takes effect immediately. You will lose paid features as soon as you confirm and move to the free Flirting tier.</p>
      </div>
      <label className={styles.cancelFeedbackLabel} htmlFor="cancel-reason">Would you mind telling us why? (optional)</label>
      <select id="cancel-reason" className={styles.input} value={reason} onChange={(event) => setReason(event.target.value)}>
        <option value="">Choose a reason</option>
        <option value="too_expensive">The plan is too expensive</option>
        <option value="not_using">I am not using the membership enough</option>
        <option value="missing_features">It does not have what I need</option>
        <option value="technical_issues">I experienced technical issues</option>
        <option value="taking_a_break">I am taking a break</option>
        <option value="other">Other</option>
      </select>
      <label className={styles.cancelFeedbackLabel} htmlFor="cancel-note">Anything else? (optional)</label>
      <textarea id="cancel-note" className={styles.textarea} rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Share any feedback that could help us improve." />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button type="button" className={styles.cancelButton} onClick={cancel} disabled={busy}>
        {busy ? "Canceling plan…" : "Cancel plan immediately"}
      </button>
    </div>
  );
}
