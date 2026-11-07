"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../account.module.css";

export default function CancelPlan({ planLabel }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function cancel() {
    if (busy || !window.confirm(`Cancel your ${planLabel} plan now? Paid access will end immediately and your account will move to the free Flirting tier.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/membership/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button type="button" className={styles.cancelButton} onClick={cancel} disabled={busy}>
        {busy ? "Canceling plan…" : "Cancel plan immediately"}
      </button>
    </div>
  );
}
