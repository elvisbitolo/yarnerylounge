"use client";

import { useEffect, useState } from "react";
import styles from "./account.module.css";

export default function PushStatus() {
  const [permission, setPermission] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const handler = () => setPermission(Notification.permission);
    let status;
    navigator.permissions?.query({ name: "notifications" })
      .then((result) => {
        status = result;
        status.addEventListener("change", handler);
        setPermission(Notification.permission);
      })
      .catch(() => {});
    return () => status?.removeEventListener("change", handler);
  }, []);

  async function finishSetup() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setMessage("This browser does not support push notifications.");
        return;
      }

      const me = await fetch("/api/me", { cache: "no-store" });
      if (!me.ok) {
        setMessage("Please sign in again before enabling notifications.");
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setMessage("Push notifications are not configured on this deployment. Please contact support.");
        return;
      }

      let currentPermission = Notification.permission;
      if (currentPermission === "default") {
        currentPermission = await Notification.requestPermission();
        setPermission(currentPermission);
      }
      if (currentPermission !== "granted") {
        setMessage(currentPermission === "denied"
          ? "Notifications are blocked in your browser settings. Allow them for this site, then try again."
          : "Browser notification permission was not granted.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "The server could not save this device's subscription.");
      }

      setMessage("Push notifications are enabled on this device.");
    } catch (error) {
      setMessage(error?.message || "Could not finish push notification setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const on = permission === "granted";
  const blocked = permission === "denied";

  return (
    <div>
      <div className={styles.row} style={{ marginTop: 10 }}>
        <div>
          <span className={styles.label}>Push notifications</span>
          <p className={styles.hint}>
            {permission === "unsupported"
              ? "This browser does not support push notifications."
              : on
                ? "Browser permission is granted. Finish setup to sync this device with your account."
                : blocked
                  ? "Browser notifications are blocked. Allow notifications for this site in your browser settings first."
                  : "Enable browser alerts for messages and mentions. Your browser will ask for permission."}
          </p>
        </div>
        <button
          type="button"
          className={styles.toggle}
          onClick={finishSetup}
          disabled={busy || blocked || permission === "unsupported"}
        >
          {busy ? "Setting up..." : on ? "Finish setup" : blocked ? "Browser blocked" : "Enable"}
        </button>
      </div>
      {message && (
        <p role="status" aria-live="polite" className={styles.hint} style={{ marginTop: 8 }}>
          {message}
        </p>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const rawData = window.atob((base64String + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}
