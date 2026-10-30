"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import styles from "./Nav.module.css";
import { Bell, CheckCheck, ChevronRight, Inbox, X } from "lucide-react";

function timeAgo(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Mirror the unread count onto the installed app's icon (Badging API).
function syncAppBadge(count) {
  if (typeof navigator === "undefined") return;
  try {
    if (count > 0 && typeof navigator.setAppBadge === "function") {
      navigator.setAppBadge(count).catch(() => {});
    } else if (typeof navigator.clearAppBadge === "function") {
      navigator.clearAppBadge().catch(() => {});
    }
  } catch {
    /* badging is best-effort */
  }
}

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    let cleanup = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (cleanup) cleanup();
      cleanup = null;
      if (!user) {
        setUnread(0);
        setItems([]);
        setOpen(false);
        syncAppBadge(0);
        return;
      }

      let active = true;
      let timer = null;
      const load = async () => {
        try {
          const res = await fetch("/api/notifications", { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          if (!active) return;
          const next = Number(data.unread) || 0;
          setUnread(next);
          syncAppBadge(next);
        } catch {
          /* keep polling */
        }
      };
      const onVisible = () => {
        if (document.visibilityState === "visible") load();
      };
      const onChanged = () => {
        load();
        if (open) loadPreview();
      };
      const onServiceWorkerMessage = (event) => {
        const count = Number(event.data?.badge);
        if (event.data?.type === "push-badge" && Number.isFinite(count)) {
          setUnread(count);
          syncAppBadge(count);
          load();
          if (open) loadPreview();
        }
      };

      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", load);
      window.addEventListener("notifications:changed", onChanged);
      navigator.serviceWorker?.addEventListener?.("message", onServiceWorkerMessage);
      load();
      timer = setInterval(load, 20000);

      cleanup = () => {
        active = false;
        if (timer) clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", load);
        window.removeEventListener("notifications:changed", onChanged);
        navigator.serviceWorker?.removeEventListener?.("message", onServiceWorkerMessage);
      };
    });
    return () => {
      unsubAuth();
      if (cleanup) cleanup();
    };
  }, [open]);

  async function loadPreview() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/notifications?preview=1", { cache: "no-store" });
      if (!res.ok) throw new Error("Notifications could not be loaded.");
      const data = await res.json();
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      const count = Number(data.unread) || 0;
      setUnread(count);
      syncAppBadge(count);
    } catch {
      setError("Could not load notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id) {
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "POST" });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      setItems((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
      if (typeof data.unread === "number" && Number.isFinite(data.unread)) {
        const count = Number(data.unread);
        setUnread(count);
        syncAppBadge(count);
      } else {
        setUnread((count) => Math.max(0, count - 1));
      }
      window.dispatchEvent(new Event("notifications:changed"));
    } catch {
      /* The full notifications page remains available if this update fails. */
    }
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) loadPreview();
  }

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.notificationWrap} ref={rootRef}>
      <button
        type="button"
        className={styles.bell}
        onClick={toggleOpen}
        title="Notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={styles.bellIcon}><Bell size={16} /></span>
        {unread > 0 && <span className={styles.bellBadge}>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <section className={styles.notificationPopover} role="dialog" aria-label="Recent notifications">
          <header className={styles.notificationPopoverHeader}>
            <div>
              <h2>Notifications</h2>
              <p>{unread ? `${unread} unread` : "You're all caught up"}</p>
            </div>
            <button type="button" className={styles.notificationClose} onClick={() => setOpen(false)} aria-label="Close notifications">
              <X size={17} />
            </button>
          </header>
          {error ? (
            <p className={styles.notificationPopoverState} role="alert">{error}</p>
          ) : loading && items.length === 0 ? (
            <p className={styles.notificationPopoverState}>Loading notifications…</p>
          ) : items.length === 0 ? (
            <div className={styles.notificationPopoverEmpty}>
              <Inbox size={24} />
              <strong>Nothing new yet</strong>
              <span>Community replies, event updates and other activity will appear here.</span>
            </div>
          ) : (
            <div className={styles.notificationPreviewList}>
              {items.map((item) => (
                <div key={item.id} className={item.read ? styles.notificationPreviewRead : styles.notificationPreviewItem}>
                  <span className={styles.notificationPreviewIcon}><Bell size={15} /></span>
                  <div className={styles.notificationPreviewBody}>
                    <p><strong>{item.actorName || "Secret Yarnery"}</strong> {item.text}</p>
                    <span>{timeAgo(item.createdAt)}</span>
                    {item.href && (
                      <Link href={item.href} onClick={() => { if (!item.read) markRead(item.id); setOpen(false); }}>
                        View update <ChevronRight size={13} />
                      </Link>
                    )}
                  </div>
                  {!item.read && <span className={styles.notificationPreviewDot} aria-label="Unread" />}
                </div>
              ))}
            </div>
          )}
          <footer className={styles.notificationPopoverFooter}>
            {unread > 0 && (
              <button type="button" onClick={async () => {
                const res = await fetch("/api/notifications/read-all", { method: "POST" });
                if (res.ok) {
                  setItems((current) => current.map((item) => ({ ...item, read: true })));
                  setUnread(0);
                  syncAppBadge(0);
                  window.dispatchEvent(new Event("notifications:changed"));
                }
              }}>
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
            <Link href="/notifications" onClick={() => setOpen(false)}>View all notifications <ChevronRight size={14} /></Link>
          </footer>
        </section>
      )}
    </div>
  );
}
