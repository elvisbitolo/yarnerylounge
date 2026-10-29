"use client";

import { useEffect, useState } from "react";
import styles from "./account.module.css";

function getDeviceContext() {
  if (typeof window === "undefined") return { isIOS: false, isStandalone: false };
  const isIOS =
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return { isIOS, isStandalone };
}

export default function PushNotificationSettings() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    const context = getDeviceContext();

    async function checkStatus() {
      await Promise.resolve();
      if (context.isIOS && !context.isStandalone) {
        setStatus("install-required");
      } else if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window) ||
        !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      ) {
        setStatus("unsupported");
      } else if (Notification.permission === "denied") {
        setStatus("blocked");
      } else {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setStatus(subscription && Notification.permission === "granted" ? "enabled" : "not-enabled");
        } catch {
          setStatus("not-enabled");
        }
      }
    }

    checkStatus();
    const refresh = () => checkStatus();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  function openSetup() {
    window.dispatchEvent(new Event("syw:show-push-prompt"));
  }

  const statusLabels = {
    checking: "Checking this device…",
    enabled: "Enabled on this device",
    "not-enabled": "Not enabled",
    blocked: "Blocked by browser",
    "install-required": "Home Screen installation needed",
    unsupported: "Not supported in this browser",
  };

  return (
    <section className={styles.card} aria-labelledby="push-settings-title">
      <h2 className={styles.cardTitle} id="push-settings-title">Browser notifications</h2>
      <p style={{ margin: "0 0 16px", color: "var(--muted, #6b6b7b)", fontSize: 14, lineHeight: 1.6 }}>
        Get alerts for messages, replies, live lounges, and community activity. This setting applies to the current browser or device.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 14px",
          border: "1px solid var(--border, #e6e6ef)",
          borderRadius: 12,
          marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground, #17171c)" }}>
          Device status
        </span>
        <span
          role="status"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "5px 10px",
            borderRadius: 999,
            background: status === "enabled" ? "#e8f8ee" : "#fce7f3",
            color: status === "enabled" ? "#166534" : "#9d174d",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {statusLabels[status]}
        </span>
      </div>

      {status === "blocked" ? (
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6 }}>
          Notifications were blocked previously. Open this site’s permissions in your browser settings, allow notifications, then return here.
        </p>
      ) : null}

      {status === "install-required" ? (
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6 }}>
          On iPhone or iPad, open this page in Safari, tap Share, choose Add to Home Screen, then open Secret Yarnery from its new Home Screen icon. Return here to enable notifications. Web push on Apple mobile devices requires iOS/iPadOS 16.4 or later.
        </p>
      ) : null}

      {status === "unsupported" ? (
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6 }}>
          This browser or device does not expose the features required for browser notifications. Try a supported, up-to-date browser.
        </p>
      ) : null}

      {status === "enabled" ? (
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6 }}>
          Browser notifications are enabled here. You can manage delivery permissions in your browser or device settings.
        </p>
      ) : null}

      {status !== "checking" && status !== "enabled" && status !== "unsupported" && status !== "install-required" && status !== "blocked" ? (
        <button
          type="button"
          onClick={openSetup}
          style={{
            width: "100%",
            minHeight: 46,
            padding: "11px 16px",
            border: 0,
            borderRadius: 10,
            background: "#f6077a",
            color: "#fff",
            font: "inherit",
            fontWeight: 700,
            cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          Enable browser notifications
        </button>
      ) : null}
    </section>
  );
}
