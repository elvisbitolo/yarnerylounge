"use client";

import { useEffect } from "react";
import { auth, onAuthStateChanged } from "@/lib/auth-client";

export default function PushSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        // The httpOnly session cookie must be live before subscribing. On the
        // Google OAuth return page it is still being exchanged, so skip this
        // run; the full reload into the app re-triggers this listener.
        const me = await fetch("/api/me", { cache: "no-store" });
        if (!me.ok) return;
      } catch {
        return;
      }
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
      }
      if (Notification.permission !== "granted") return;

      try {
        const reg = await navigator.serviceWorker.getRegistration();
        let subscription = await reg.pushManager.getSubscription();
        if (!subscription) {
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
            ),
          });
        }
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription }),
        });
      } catch {
        // Push setup is best-effort; never block the app.
      }
    });
    return unsub;
  }, []);

  return null;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
