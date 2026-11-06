"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./suggest.module.css";

export default function SuggestEventPage() {
  const [form, setForm] = useState({ title: "", description: "", startTime: "", endTime: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/event-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          startTime: new Date(form.startTime).toISOString(),
          endTime: form.endTime ? new Date(form.endTime).toISOString() : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not submit your event");
      setSent(true);
      setForm({ title: "", description: "", startTime: "", endTime: "" });
    } catch (err) {
      setError(err.message || "Could not submit your event");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <Link href="/dashboard" className={styles.back}>← Dashboard</Link>
      <section className={styles.card}>
        <p className={styles.kicker}>Member event proposal</p>
        <h1>Bring the community together.</h1>
        <p className={styles.intro}>Suggest a workshop, crochet-along, meetup, or community session. The team will review your idea before it appears on the events calendar.</p>
        {sent ? (
          <div className={styles.success} role="status">
            <strong>Your event idea has been submitted.</strong>
            <p>An administrator will review it. You can continue exploring the community while it is under review.</p>
            <Link href="/events">Explore upcoming events →</Link>
          </div>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            <label>Event title<input required maxLength={140} value={form.title} onChange={(e) => update("title", e.target.value)} /></label>
            <label>What will happen?<textarea rows={5} maxLength={5000} value={form.description} onChange={(e) => update("description", e.target.value)} /></label>
            <div className={styles.fields}>
              <label>Starts<input required type="datetime-local" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} /></label>
              <label>Ends (optional)<input type="datetime-local" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} /></label>
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
