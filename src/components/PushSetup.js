"use client";

import { useEffect, useState } from "react";
import { auth, onAuthStateChanged } from "@/lib/auth-client";

const PROMPT_SEEN_PREFIX = "syw-push-opt-in-prompt-seen:";

function requiresHomeScreenInstall() {
  if (typeof window === "undefined") return false;
  const isIOS =
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return isIOS && !isStandalone;
}

export default function PushSetup() {
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [permission, setPermission] = useState(() =>
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default"
  );
  const [subscribed, setSubscribed] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSignedIn(Boolean(user));
      setUserId(user?.uid || null);
      if (!user) setPromptVisible(false);
    });
    return unsubscribe;
  }, []);

  // Load preferences on sign-in so existing members receive the one-time
  // defaults rollout without having to visit the notifications settings page.
  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/me/notifications/preferences", { cache: "no-store" }).catch(() => {});
  }, [signedIn]);

  useEffect(() => {
    const canPush =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
      !requiresHomeScreenInstall();

    if (!signedIn || !userId || !canPush) return;

    let cancelled = false;
    navigator.serviceWorker.ready
      .then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        if (cancelled) return;
        setSubscribed(Boolean(subscription));

        // Existing members may already have a local subscription that is
        // missing from the server database. Reconcile it automatically.
        if (subscription && Notification.permission === "granted") {
          const response = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: subscription.toJSON() }),
          });
          if (!response.ok) throw new Error("Could not sync push subscription.");
        }

        // The opt-in prompt is shown once per member on this browser. Closing
        // it or leaving it alone will not make it reappear on every page visit.
        if (!subscription && Notification.permission !== "denied") {
          const seenKey = `${PROMPT_SEEN_PREFIX}${userId}`;
          if (window.localStorage.getItem(seenKey) !== "1") {
            window.localStorage.setItem(seenKey, "1");
            setPromptVisible(true);
          } else {
            setPromptVisible(false);
          }
        } else {
          setPromptVisible(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn, userId]);

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
            ? "Notifications are blocked in your browser settings. You can manage this in your browser settings."
            : "Notifications were not enabled. You can try again from notification settings."
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
      setPromptVisible(false);
      setMessage("Browser notifications are enabled on this device.");
    } catch {
      setMessage("Could not enable browser notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const handleEnableRequest = () => {
      enableNotifications();
    };
    const handleShowPrompt = () => {
      setMessage("");
      setPromptVisible(true);
    };
    window.addEventListener("syw:enable-push", handleEnableRequest);
    window.addEventListener("syw:show-push-prompt", handleShowPrompt);
    return () => {
      window.removeEventListener("syw:enable-push", handleEnableRequest);
      window.removeEventListener("syw:show-push-prompt", handleShowPrompt);
    };
  }, []);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
    !requiresHomeScreenInstall();

  if (!signedIn || !supported || !promptVisible || subscribed) return null;

  return (
    <aside
      aria-label="Browser notification setup"
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
      <button
        type="button"
        onClick={() => setPromptVisible(false)}
        aria-label="Dismiss browser notification prompt"
        title="Dismiss"
        style={{
          position: "absolute",
          top: "8px",
          right: "10px",
          width: "28px",
          height: "28px",
          padding: 0,
          border: 0,
          borderRadius: "50%",
          background: "transparent",
          color: "#c9c0c7",
          fontSize: "22px",
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ×
      </button>
      <p style={{ margin: "0 30px 6px 0", fontWeight: 700 }}>Stay in the loop</p>
      <p style={{ margin: "0 0 12px", fontSize: "14px", lineHeight: 1.5, color: "#c9c0c7" }}>
        Get browser alerts for messages, replies, live lounges, and community activity.
      </p>
      {message ? (
        <p role="status" style={{ margin: "0 0 10px", fontSize: "13px", lineHeight: 1.4 }}>
          {message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={enableNotifications}
        disabled={busy || permission === "denied"}
        style={{
          minHeight: "40px",
          padding: "0 14px",
          border: 0,
          borderRadius: "999px",
          background: busy || permission === "denied" ? "#51464e" : "#f6077a",
          color: "#fff",
          font: "inherit",
          fontWeight: 700,
          cursor: busy || permission === "denied" ? "not-allowed" : "pointer",
        }}
      >
        {busy
          ? "Please wait…"
          : permission === "denied"
            ? "Blocked in browser settings"
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
