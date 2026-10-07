"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./profile.module.css";

// Live presence for a member's profile header: a green "Active now" line, or an
// "In <Lounge>" pill that links straight to the room they most recently
// touched. Deliberately quiet when the member is offline — nothing renders, so
// the ~90% of members who are away stay clutter-free (same signal the member
// directory gives). Reused on the viewer's own profile too.
export default function MemberPresence({ userId }) {
  const [presence, setPresence] = useState(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/presence?ids=${encodeURIComponent(userId)}`, {
          cache: "no-store",
        });
        const data = response.ok ? await response.json() : null;
        if (active) setPresence(data?.presence?.[userId] || null);
      } catch {
        if (active) setPresence(null);
      }
    };
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [userId]);

  // Offline, or presence is still being read: show nothing.
  if (!presence?.online) return null;

  const room = presence.room?.slug ? presence.room : null;
  if (room) {
    return (
      <Link
        href={`/rooms/${room.slug}`}
        className={styles.presenceLounge}
        title={`Join ${room.name}`}
      >
        <span className={styles.presenceDot} aria-hidden="true" />
        In {room.name}
      </Link>
    );
  }

  return (
    <span className={styles.presenceStatus} data-online="true">
      <span className={styles.presenceDot} aria-hidden="true" />
      Active now
    </span>
  );
}