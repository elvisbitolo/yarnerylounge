"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, Heart, MessageCircle, Users } from "lucide-react";
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

function notificationIcon(type) {
  if (["comment", "chat", "dm", "mention"].includes(type)) return MessageCircle;
  if (["event_reminder", "event_rsvp", "rsvp", "availability_rsvp", "lounge_live", "recording_ready"].includes(type)) return CalendarDays;
  if (["follow", "watch_online", "watch_room", "priority_online"].includes(type)) return Users;
  if (["like"].includes(type)) return Heart;
  return Bell;
}

function isActivity(item) {
  return !["automation", "digest", "reengagement"].includes(item.type);
}

export default function NotificationsList({ notifications }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  function announceChange() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("notifications:changed"));
  }

  async function markRead(id) {
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "POST" });
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
  const activity = notifications.filter(isActivity).length;
  const visibleNotifications = useMemo(() => notifications.filter((item) => {
    if (filter === "unread") return !item.read;
    if (filter === "activity") return isActivity(item);
    return true;
  }), [filter, notifications]);

  return (
    <div className={styles.notificationCenter}>
      <div className={styles.notificationToolbar}>
        <div className={styles.filterTabs} role="tablist" aria-label="Filter notifications">
          <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? styles.filterTabActive : styles.filterTab} onClick={() => setFilter("all")}>
            All <span>{notifications.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={filter === "unread"} className={filter === "unread" ? styles.filterTabActive : styles.filterTab} onClick={() => setFilter("unread")}>
            Unread <span>{unread}</span>
          </button>
          <button type="button" role="tab" aria-selected={filter === "activity"} className={filter === "activity" ? styles.filterTabActive : styles.filterTab} onClick={() => setFilter("activity")}>
            Activity <span>{activity}</span>
          </button>
        </div>
        {unread > 0 && (
          <button className={styles.markAll} onClick={markAllRead} disabled={busy}>
            {busy ? "Marking…" : "Mark all as read"}
          </button>
        )}
      </div>

      {error && <p role="alert" className={styles.errorMessage}>{error}</p>}
      {visibleNotifications.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}><Bell size={23} /></span>
          <strong>{filter === "unread" ? "You're all caught up" : "No notifications here yet"}</strong>
          <span>{filter === "unread" ? "New notifications will appear here when there is activity." : "Replies, messages, event updates and community activity will appear here."}</span>
          {filter !== "all" && <button type="button" className={styles.resetFilter} onClick={() => setFilter("all")}>Show all notifications</button>}
        </div>
      ) : (
        <div className={styles.list}>
          {visibleNotifications.map((n) => {
            const Icon = notificationIcon(n.type);
            return (
              <article key={n.id} className={n.read ? `${styles.item} ${styles.itemRead}` : styles.item}>
                <div className={styles.avatar}>
                  {n.actorPhotoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.actorPhotoURL} alt={`${n.actorName || "Member"} profile`} loading="lazy" />
                  ) : (
                    <Icon size={18} aria-hidden="true" />
                  )}
                </div>
                <div className={styles.body}>
                  <p className={styles.text}>
                    {n.actorName && <strong>{n.actorName} </strong>}{n.text}
                  </p>
                  <p className={styles.time}>{timeAgo(n.createdAt)}</p>
                </div>
                {n.href && (
                  <Link className={styles.view} href={n.href} onClick={() => { if (!n.read) markRead(n.id); }}>
                    View
                  </Link>
                )}
                {!n.read && <span className={styles.dot} aria-label="Unread" />}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
