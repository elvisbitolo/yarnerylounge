"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";

export default function ChristaLiveInvitation() {
  const [live, setLive] = useState(null);

  useEffect(() => {
    let active = true;
    let timer;

    async function checkPresence() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/dashboard/christa-live", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (active) setLive(payload.live || null);
      } catch {
        // Keep the last known state during a transient network failure.
      }
    }

    checkPresence();
    timer = window.setInterval(checkPresence, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkPresence();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!live) return null;

  return (
    <section className={styles.christaLiveCard} aria-label="Christa is live">
      <div className={styles.christaLiveMain}>
        <div className={styles.christaLiveEyebrow}>
          <span className={styles.christaLiveDot} aria-hidden="true" />
          LIVE NOW
        </div>
        <h2 className={styles.christaLiveTitle}>
          {live.hostName} is live in the lounge!
        </h2>
        <p className={styles.christaLiveDescription}>
          Join {live.hostName} in <strong>{live.roomName}</strong>.
        </p>
      </div>
      <Link
        className={styles.christaLiveButton}
        href={`/rooms/${encodeURIComponent(live.roomSlug)}`}
      >
        Join Christa <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
