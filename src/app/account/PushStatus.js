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

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const rawData = window.atob((base64String + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

export default function PushStatus() {
  const [permission, setPermission] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const [subscribed, setSubscribed] = useState(false);
  const [installRequired, setInstallRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshStatus() {
    const context = getDeviceContext();
    setInstallRequired(context.isIOS && !context.isStandalone);

    if (
      context.isIOS && !context.isStandalone ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window) ||
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ) {
      setSubscribed(false);
      return;
    }

    setPermission(Notification.permission);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(subscription) && Notification.permission === "granted");
    } catch {
      setSubscribed(false);
    }
  }

  useEffect(() => {
    refreshStatus();
    const refresh = () => refreshStatus();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  async function enableNotifications() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
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

      setSubscribed(true);
      setMessage("Push notifications are enabled on this device.");
    } catch (error) {
      setMessage(error?.message || "Could not finish push notification setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Could not remove this device from push notifications.");
        }
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Push notifications are disabled on this device. Other devices are unchanged.");
    } catch (error) {
      setMessage(error?.message || "Could not disable push notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const blocked = permission === "denied";
  const unsupported =
    permission === "unsupported" ||
    !("serviceWorker" in (typeof navigator === "undefined" ? {} : navigator)) ||
    (typeof window !== "undefined" && !("PushManager" in window)) ||
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  return (
    <div>
      <div className={styles.row} style={{ marginTop: 10 }}>
        <div>
          <span className={styles.label}>Push notifications</span>
          <p className={styles.hint}>
            {installRequired
              ? "On iPhone or iPad, add this site to your Home Screen and open it from that icon before enabling push notifications."
              : unsupported
                ? "This browser or deployment does not support push notifications."
                : subscribed
                  ? "Push notifications are enabled on this device."
                  : blocked
                    ? "Browser notifications are blocked. Allow them for this site in your browser settings first."
                    : "Enable browser alerts for messages, replies, events, and community activity."}
          </p>
        </div>
        {!installRequired && !unsupported && !blocked ? (
          <button
            type="button"
            className={styles.toggle}
            onClick={subscribed ? disableNotifications : enableNotifications}
            disabled={busy}
            aria-pressed={subscribed}
          >
            {busy ? "Please wait…" : subscribed ? "Disable on this device" : "Enable"}
          </button>
        ) : null}
      </div>
      {message && (
        <p role="status" aria-live="polite" className={styles.hint} style={{ marginTop: 8 }}>
          {message}
        </p>
      )}
    </div>
  );
}
