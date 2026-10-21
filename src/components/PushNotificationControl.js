"use client";

import { useEffect, useState } from "react";
import styles from "./PushNotificationControl.module.css";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

export default function PushNotificationControl() {
  const [state, setState] = useState("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function checkSubscription() {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
          if (!cancelled) setState("unsupported");
          return;
        }
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = registration
          ? await registration.pushManager.getSubscription()
          : null;
        if (!cancelled) setState(subscription ? "enabled" : "disabled");
      } catch {
        if (!cancelled) setState("disabled");
      }
    }
    checkSubscription();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setMessage("");
    setState("working");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Browser notifications are not configured yet.");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("disabled");
        setMessage("Permission was not granted. You can enable it in your browser settings.");
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save your subscription.");
      setState("enabled");
      setMessage("Browser notifications are enabled on this device.");
    } catch (error) {
      setState("disabled");
      setMessage(error?.message || "Could not enable notifications. Please try again.");
    }
  }

  async function disable() {
    setMessage("");
    setState("working");
    try {
      const response = await fetch("/api/push/subscribe", {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not disable notifications.");
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) await subscription.unsubscribe();
      setState("disabled");
      setMessage("Browser notifications are disabled for this account.");
    } catch (error) {
      setState("enabled");
      setMessage(error?.message || "Could not disable notifications. Please try again.");
    }
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={state === "enabled" ? disable : enable}
        disabled={state === "checking" || state === "working" || state === "unsupported"}
      >
        {state === "checking" ? "Checking..." :
          state === "working" ? "Please wait..." :
          state === "enabled" ? "Disable on this device" :
          state === "unsupported" ? "Not supported in this browser" :
          "Enable on this device"}
      </button>
      {message && <p className={styles.message} role="status">{message}</p>}
    </div>
  );
}
