"use client";

import { useState } from "react";
import styles from "./account.module.css";

export default function EmailNotifications({ enabled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [on, setOn] = useState(enabled !== "off");

  async function toggle() {
    const next = !on;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifications: next ? "on" : "off" }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Could not update your preferences");
        return;
      }
      setOn(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.row}>
      <div>
        <span className={styles.label}>All optional email notifications</span>
        <p className={styles.hint}>
          Turn this off to unsubscribe from all optional email notifications. In-app notifications will continue to work.
        </p>
      </div>
      <button
        type="button"
        className={on ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        aria-label={on ? "Turn off email notifications" : "Turn on email notifications"}
      >
        {busy ? "Saving..." : on ? "Unsubscribe" : "Resubscribe"}
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
