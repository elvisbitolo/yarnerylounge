"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./submissions.module.css";

export default function EventSubmissionsPage() {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/event-submissions");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load submissions");
    setItems(data.submissions || []);
  }, []);

  useEffect(() => { load().catch((err) => setError(err.message)); }, [load]);

  async function review(item, decision) {
    setBusyId(item.id);
    setError("");
    try {
      const response = await fetch("/api/event-submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Review failed");
      setItems((current) => current.map((entry) => entry.id === item.id ? data.submission : entry));
    } catch (err) {
      setError(err.message || "Review failed");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className={styles.page}>
      <Link href="/admin/events" className={styles.back}>← Event manager</Link>
      <header><p className={styles.kicker}>Community moderation</p><h1>Event proposals</h1><p>Review member-submitted events before they are published to the community calendar.</p></header>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.list}>
        {items.length === 0 ? <p className={styles.empty}>No event proposals yet.</p> : items.map((item) => (
          <article className={styles.item} key={item.id}>
            <div className={styles.top}><div><span className={styles.status}>{item.status}</span><h2>{item.title}</h2></div><small>{new Date(item.createdAt).toLocaleString()}</small></div>
            <p className={styles.meta}>Submitted by {item.user?.name || "Member"} · {item.user?.plan || "member"}</p>
            {item.description && <p className={styles.description}>{item.description}</p>}
            <p className={styles.meta}>Starts {new Date(item.startTime).toLocaleString()}{item.endTime ? ` · Ends ${new Date(item.endTime).toLocaleString()}` : ""}</p>
            {item.status === "pending" && <div className={styles.actions}><button disabled={!!busyId} onClick={() => review(item, "approve")}>{busyId === item.id ? "Saving…" : "Approve & publish"}</button><button className={styles.reject} disabled={!!busyId} onClick={() => review(item, "reject")}>Reject</button></div>}
          </article>
        ))}
      </div>
    </main>
  );
}
