"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import styles from "./Nav.module.css";
import { Bell } from "lucide-react";

// Mirror the unread count onto the installed app's icon (Badging API). Without
// this, a push that arrives while the app is closed shows no number anywhere
// until the member opens it and the in-app bell catches up.
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

  useEffect(() => {
    let cleanup = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (cleanup) cleanup();
      cleanup = null;
      if (!user) {
        setUnread(0);
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
      // NotificationsList dispatches this after marking rows read, so the
      // badge clears immediately instead of waiting for the next poll.
      const onChanged = () => load();
      // The service worker forwards the count with every push, so a focused
      // tab shows the number the moment it lands rather than on the next poll.
      const onServiceWorkerMessage = (event) => {
        const count = Number(event.data?.badge);
        if (event.data?.type === "push-badge" && Number.isFinite(count)) {
          setUnread(count);
          syncAppBadge(count);
          load();
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
        timer = null;
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
  }, []);

  return (
    <Link
      className={styles.bell}
      href="/notifications"
      title="Notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <span className={styles.bellIcon}><Bell size={16} /></span>
      {unread > 0 && <span className={styles.bellBadge}>{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}
