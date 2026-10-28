"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./notifications.module.css";

function timeAgo(iso) {
  const millis = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - millis) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(millis).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function NotificationsList({ notifications }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The nav bell lives in the persistent layout, so it will not re-render from
  // router.refresh(). Tell it (and the app-icon badge) to re-read the count.
  function announceChange() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("notifications:changed"));
    }
  }

  async function markRead(id) {
    try {
      const response = await fetch(`/api/notifications/${id}`, { method: "POST" });
      if (!response.ok) throw new Error("Could not mark this notification as read.");
      setError("");
      announceChange();
      router.refresh();
    } catch {
      setError("Could not update this notification. Please try again.");
    }
  }

  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Update all unread rows in the database, not only the 50 shown here.
      const response = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!response.ok) throw new Error("Could not mark notifications as read.");
      announceChange();
      router.refresh();
    } catch {
      setError("Could not mark all notifications as read. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div>
      {error && <p role="alert" className={styles.empty}>{error}</p>}
      {unread > 0 && (
        <button className={styles.markAll} onClick={markAllRead} disabled={busy}>
          {busy ? "Marking…" : "Mark all as read"}
        </button>
      )}

      {notifications.length === 0 ? (
        <p className={styles.empty}>
          You&apos;re all caught up. Notifications appear when members reply to your posts or RSVP to events.
        </p>
      ) : (
        <div className={styles.list}>
          {notifications.map((n) => (
            <div
              key={n.id}
              className={n.read ? `${styles.item} ${styles.itemRead}` : styles.item}
              onClick={() => !n.read && markRead(n.id)}
            >
              <div className={styles.avatar}>
                {(n.actorName || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className={styles.body}>
                <p className={styles.text}>
                  <strong>{n.actorName}</strong> {n.text}
                </p>
                <p className={styles.time}>{timeAgo(n.createdAt)}</p>
              </div>
              {n.href && (
                <Link className={styles.view} href={n.href}>View</Link>
              )}
              {!n.read && <span className={styles.dot} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
