"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

const LABELS = {
  database: "Database connectivity",
  email: "Email delivery configuration",
  whatsapp: "WhatsApp integration",
  browserPush: "Browser push",
  scheduledJobs: "Scheduled jobs / cron",
};

const STATUS_LABELS = {
  healthy: "Healthy",
  configured: "Configured — delivery not tested",
  needs_configuration: "Configuration missing",
  unhealthy: "Unhealthy",
  webhook_secret_missing: "Webhook verification secret missing",
  unknown: "Not checked",
};

export default function ClientPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/system-health", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load system health.");
      setData(body);
    } catch (err) {
      setError(err.message || "Could not load system health.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function initialLoad() {
      try {
        const response = await fetch("/api/admin/system-health", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load system health.");
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load system health.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    initialLoad();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OWNER OPERATIONS</p>
          <h1>System health</h1>
          <p>Check database connectivity and required integration configuration without exposing secret values.</p>
        </div>
        <button type="button" onClick={load} disabled={loading}>{loading ? "Checking…" : "Run checks"}</button>
      </header>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {loading && !data ? <p>Checking integrations…</p> : null}
      {data ? <>
        <div className={styles.grid}>
          {Object.entries(data.integrations).map(([key, item]) => (
            <article className={styles.card} key={key}>
              <div className={styles.cardHead}>
                <h2>{LABELS[key] || key}</h2>
                <span className={item.status === "healthy" || item.status === "configured" ? styles.neutral : styles.warning}>
                  {STATUS_LABELS[item.status] || item.status}
                </span>
              </div>
              <p>{key === "database" ? "A live SELECT 1 query was attempted." : "Configuration presence only; no test email, WhatsApp message, or push notification was sent."}</p>
              {key === "whatsapp" && item.webhookVerificationConfigured === false ? <p className={styles.warningText}>Incoming delivery-status webhooks may not be verifiable until the app secret is configured.</p> : null}
            </article>
          ))}
        </div>
        <p className={styles.updated}>Last checked: {new Date(data.checkedAt).toLocaleString()}</p>
        <nav className={styles.links} aria-label="Operations shortcuts">
          <Link href="/admin/automations">Automation control room</Link>
          <Link href="/admin/re-engagement">Member reactivation</Link>
          <Link href="/admin/audit">Audit log</Link>
          <Link href="/admin/analytics">Owner reports</Link>
        </nav>
        <p className={styles.note}>A configured integration is not proof of successful delivery. Email, WhatsApp, and push require separate end-to-end tests; this page deliberately does not send messages or expose secret values.</p>
      </> : null}
    </main>
  );
}
