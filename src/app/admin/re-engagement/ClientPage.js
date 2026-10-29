"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";

const METRICS = [
  ["totalMembers", "Total members", "All registered accounts"],
  ["inactiveOver48Hours", "Inactive 48+ hours", "Members who may need a nudge"],
  ["neverVisitedOver48Hours", "Never visited", "Accounts with no saved session"],
  ["remindersSentLast7Days", "Reminders sent", "Last 7 days"],
  ["returnedAfterReminderLast7Days", "Returned after reminder", "Session activity after a reminder"],
];

export default function ClientPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/re-engagement/analytics", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load member reactivation analytics.");
      setData(body);
    } catch (err) {
      setError(err.message || "Could not load member reactivation analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialLoad() {
      try {
        const response = await fetch("/api/admin/re-engagement/analytics", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load member reactivation analytics.");
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load member reactivation analytics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    initialLoad();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>COMMUNITY HEALTH</p>
          <h1>Member reactivation</h1>
          <p className={styles.description}>Monitor inactivity, reminder delivery, and members returning to Secret Yarnery.</p>
        </div>
        <button className={styles.refresh} type="button" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh metrics"}</button>
      </header>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {loading && !data ? <p className={styles.status}>Loading member activity…</p> : null}

      {data ? <>
        <div className={styles.grid}>
          {METRICS.map(([key, label, detail]) => (
            <article className={styles.card} key={key}>
              <p className={styles.metricLabel}>{label}</p>
              <p className={styles.value}>{Number(data[key] || 0).toLocaleString()}</p>
              <p className={styles.detail}>{detail}</p>
            </article>
          ))}
        </div>
        <section className={styles.note}>
          <h2>How this works</h2>
          <p>Members are considered inactive after 48 hours without a recorded session visit. The scheduled reminder job runs daily and applies a seven-day cooldown. Suspended accounts are excluded from the inactivity counts.</p>
          <p>“Returned after reminder” means a recorded session activity timestamp is later than a reminder sent in the last seven days. It is a useful proxy for reactivation, not proof the email or push notification caused the visit.</p>
          <p className={styles.updated}>Updated {new Date(data.generatedAt).toLocaleString()}</p>
        </section>
      </> : null}
    </section>
  );
}
