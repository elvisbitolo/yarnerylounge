"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./chat.module.css";

// Reads presence for one member (DM) or a set (group). When a member is in a
// lounge, the status becomes "In <Lounge>" and links straight to the room.
export default function PresenceStatus({ userId, userIds = [] }) {
  const ids = [...new Set([userId, ...userIds].filter(Boolean))];
  const idsKey = ids.join(",");
  const [onlineCount, setOnlineCount] = useState(0);
  const [room, setRoom] = useState(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/presence?ids=${encodeURIComponent(idsKey)}`, { cache: "no-store" });
        const data = response.ok ? await response.json() : null;
        if (!active) return;
        setOnlineCount(ids.filter((id) => data?.presence?.[id]?.online === true).length);
        const firstRoom = ids
          .map((id) => data?.presence?.[id]?.room)
          .find((value) => value && value.slug);
        setRoom(firstRoom || null);
      } catch {
        if (active) {
          setOnlineCount(0);
          setRoom(null);
        }
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

  if (room && userIds.length === 0) {
    return (
      <Link href={`/rooms/${room.slug}`} className={styles.presenceLounge} title={`Join ${room.name}`}>
        <span className={styles.presenceDot} aria-hidden="true" />
        In {room.name}
      </Link>
    );
  }

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
