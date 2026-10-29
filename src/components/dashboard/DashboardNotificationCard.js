"use client";

import { useEffect, useState } from "react";
import styles from "./dashboard.module.css";

export default function DashboardNotificationCard() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;

    async function checkStatus() {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window) ||
        !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      ) {
        if (active) setStatus("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (active) setStatus("blocked");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (active) {
          setStatus(subscription && Notification.permission === "granted" ? "enabled" : "not-enabled");
        }
      } catch {
        if (active) setStatus("not-enabled");
      }
    }

    checkStatus();
    window.addEventListener("focus", checkStatus);
    return () => {
      active = false;
      window.removeEventListener("focus", checkStatus);
    };
  }, []);

  if (status === "checking" || status === "enabled" || status === "unsupported") return null;

  function openSetup() {
    window.dispatchEvent(new Event("syw:show-push-prompt"));
  }

  return (
    <section className={styles.notificationCard} aria-labelledby="dashboard-notifications-title">
      <div className={styles.notificationIcon} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      </div>
      <div className={styles.notificationCopy}>
        <p className={styles.notificationEyebrow}>STAY CONNECTED</p>
        <h2 className={styles.notificationTitle} id="dashboard-notifications-title">
          {status === "blocked" ? "Turn notifications back on" : "Don’t miss a moment"}
        </h2>
        <p className={styles.notificationDescription}>
          Get timely browser alerts for new messages, replies, live lounges, and community activity—even when you’re not looking at Secret Yarnery.
        </p>
        {status === "blocked" ? (
          <p className={styles.notificationHint}>
            Notifications are blocked in this browser. Open this site’s permissions in your browser settings, allow notifications, then return to your dashboard.
          </p>
        ) : (
          <p className={styles.notificationHint}>
            You’re in control. Enable alerts for this device, and change the permission any time in your browser settings.
          </p>
        )}
      </div>
      <div className={styles.notificationActions}>
        <button
          type="button"
          className={styles.notificationButton}
          onClick={openSetup}
          disabled={status === "blocked"}
        >
          {status === "blocked" ? "Blocked in browser" : "Enable notifications"}
        </button>
        <a className={styles.notificationLink} href="/account/profile">
          Notification settings
        </a>
      </div>
    </section>
  );
}
