"use client";

import { useEffect } from "react";

// Register the service worker early, but never prompt for notification
// permission automatically. Members opt in from NotificationPreferences.
export default function PushSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  }, []);

  return null;
}
