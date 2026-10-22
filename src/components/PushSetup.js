"use client";

import { useEffect, useState } from "react";
import { auth, onAuthStateChanged } from "@/lib/auth-client";

export default function PushSetup() {
  const [signedIn, setSignedIn] = useState(false);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSignedIn(Boolean(user));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const canPush =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

    setSupported(canPush);
    if (!canPush) return;
    setPermission(Notification.permission);

    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setSubscribed(Boolean(subscription));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function enableNotifications() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const me = await fetch("/api/me", { cache: "no-store" });
      if (!me.ok) {
        setMessage("Please sign in again before enabling notifications.");
        return;
      }

      const result = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      setPermission(result);

      if (result !== "granted") {
        setMessage(
          result === "denied"
            ? "Notifications are blocked in your browser settings."
            : "Notifications were not enabled."
        );
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
          ),
        });
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!response.ok) throw new Error("Could not save this device's subscription.");

      setSubscribed(true);
      setMessage("Push notifications are enabled on this device.");
    } catch {
      setMessage("Could not enable push notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/push/subscribe", { method: "DELETE" });
      if (!response.ok) {
        setMessage("Could not disable notifications on the server. Please try again.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();

      setSubscribed(false);
      setMessage("Push notifications are disabled for your account.");
    } catch {
      setMessage("Could not disable notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn || !supported) return null;

  return (
    <aside
      aria-label="Push notification settings"
      style={{
        position: "fixed",
        zIndex: 1000,
        right: "max(16px, env(safe-area-inset-right))",
        bottom: "max(16px, env(safe-area-inset-bottom))",
        width: "min(360px, calc(100vw - 32px))",
        padding: "16px",
        border: "1px solid #553047",
        borderRadius: "14px",
        background: "#171317",
        color: "#f5f4f2",
        boxShadow: "0 12px 36px rgba(0,0,0,.35)",
      }}
    >
      <p style={{ margin: "0 0 6px", fontWeight: 700 }}>Stay in the loop</p>
      <p style={{ margin: "0 0 12px", fontSize: "14px", lineHeight: 1.5, color: "#c9c0c7" }}>
        Get alerts for messages, replies, live lounges, and community activity.
      </p>
      {message ? (
        <p role="status" style={{ margin: "0 0 10px", fontSize: "13px", lineHeight: 1.4 }}>
          {message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={subscribed ? disableNotifications : enableNotifications}
        disabled={busy || (!subscribed && permission === "denied")}
        style={{
          minHeight: "40px",
          padding: "0 14px",
          border: 0,
          borderRadius: "999px",
          background: busy || (!subscribed && permission === "denied") ? "#51464e" : "#f6077a",
          color: "#fff",
          font: "inherit",
          fontWeight: 700,
          cursor: busy || (!subscribed && permission === "denied") ? "not-allowed" : "pointer",
        }}
      >
        {busy
          ? "Please wait…"
          : subscribed
            ? "Disable notifications"
            : permission === "denied"
              ? "Blocked in browser"
              : permission === "granted"
                ? "Finish notification setup"
                : "Enable notifications"}
      </button>
    </aside>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const rawData = window.atob((base64String + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}
