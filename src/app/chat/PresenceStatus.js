"use client";

import { useEffect, useState } from "react";
import styles from "./chat.module.css";

export default function PresenceStatus({ userId, userIds = [] }) {
  const ids = [...new Set([userId, ...userIds].filter(Boolean))];
  const idsKey = ids.join(",");
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/presence?ids=${encodeURIComponent(idsKey)}`, { cache: "no-store" });
        const data = response.ok ? await response.json() : null;
        if (active) setOnlineCount(ids.filter((id) => data?.presence?.[id]?.online === true).length);
      } catch {
        if (active) setOnlineCount(0);
      }
    };
    refresh();
    const refreshTimer = setInterval(refresh, 15_000);
    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, [idsKey]);

  if (!ids.length) return null;
  const online = onlineCount > 0;
  const label = userIds.length > 0
    ? (online ? `${onlineCount} active now` : "No one active")
    : (online ? "Active now" : "Away");

  return (
    <span className={styles.presenceStatus} data-online={online ? "true" : "false"}>
      <span className={styles.presenceDot} aria-hidden="true" />
      {label}
    </span>
  );
}
