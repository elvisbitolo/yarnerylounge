"use client";

import { useEffect, useState } from "react";
import styles from "./account.module.css";

function supportsPush() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export default function PushStatus() {
  const [permission, setPermission] = useState(() =>
    typeof window === "undefined" || !("Notification" in window)
      ? "unsupported"
      : Notification.permission
  );
  const [supported, setSupported] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSupported(supportsPush());
    setAppleMobile(isAppleMobile());
    if ("Notification" in window) setPermission(Notification.permission);

    let cancelled = false;
    async function checkSubscription() {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
        const registration = await navigator.serviceWorker.register("/sw.js");
        const ready = await navigator.serviceWorker.ready;
        const current = await (ready || registration).pushManager.getSubscription();
        if (cancelled) return;
        setSubscribed(Boolean(current));
      } catch {
        if (!cancelled) setMessage("We couldn't check this device's notification status. Try enabling notifications again.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    checkSubscription();
    return () => { cancelled = true; };
  }, []);

  async function enablePush() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      if (!supportsPush()) {
        setMessage("This browser does not support web push notifications.");
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
          ? "Notifications are blocked by your browser. Allow them in this site's browser settings, then try again."
          : "Notification permission wasn't granted.");
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
      if (!response.ok) throw new Error(data.error || "The server couldn't save this device.");

      setSubscribed(true);
      setMessage("Push notifications are enabled on this device.");
    } catch (error) {
      setMessage(error?.message || "Could not enable push notifications. Please try again.");
    } finally {
      setBusy(false);
      setChecking(false);
    }
  }

  async function disablePush() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager?.getSubscription();

      if (subscription) {
        const response = await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not remove this device from push notifications.");
        await subscription.unsubscribe();
      }

      setSubscribed(false);
      setMessage("Push notifications are turned off on this device. Other registered devices are unchanged.");
    } catch (error) {
      setMessage(error?.message || "Could not turn off push notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const blocked = permission === "denied";

  return (
    <div>
      <div className={styles.row} style={{ marginTop: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className={styles.label}>Push notifications</span>
          <p className={styles.hint}>
            {permission === "unsupported" || !supported
              ? appleMobile
                ? "On iPhone or iPad, add this site to your Home Screen and open it there to enable web push."
                : "This browser doesn't currently support web push notifications."
              : subscribed
                ? "This device is registered to receive alerts when you're away from the site."
                : blocked
                  ? "Notifications are blocked in your browser settings. Allow them for this site before enabling push."
                  : "Get browser alerts for messages, mentions, events and other notification types you've enabled."}
          </p>
        </div>
        <button
          type="button"
          className={subscribed ? styles.manage : styles.toggle}
          onClick={subscribed ? disablePush : enablePush}
          disabled={busy || checking || !supported || (blocked && !subscribed)}
          aria-pressed={subscribed}
        >
          {busy || checking
            ? "Please wait…"
            : subscribed
              ? "Turn off"
              : blocked
                ? "Browser blocked"
                : "Enable"}
        </button>
      </div>
      {appleMobile && (
        <p className={styles.hint} style={{ marginTop: 8 }}>
          iPhone/iPad: open the Share menu in Safari, choose “Add to Home Screen”, then launch the installed site and enable notifications here.
        </p>
      )}
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
