"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import styles from "./Nav.module.css";
import { Bell } from "lucide-react";

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let timer = null;
    let active = false;
    const stop = () => {
      active = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      stop();
      if (!user) {
        setUnread(0);
        return;
      }
      active = true;
      const load = async () => {
        try {
          const res = await fetch("/api/notifications");
          if (!res.ok) return;
          const data = await res.json();
          if (active) setUnread(Number(data.unread) || 0);
        } catch {
          /* keep polling */
        }
      };
      load();
      timer = setInterval(load, 30000);
    });
    return () => {
      stop();
      unsubAuth();
    };
  }, []);

  return (
    <Link className={styles.bell} href="/notifications" title="Notifications">
      <span className={styles.bellIcon}><Bell size={16} /></span>
      {unread > 0 && <span className={styles.bellBadge}>{unread}</span>}
    </Link>
  );
}
