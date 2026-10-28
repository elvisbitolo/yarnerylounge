"use client";

import { useState, useEffect } from "react";
import styles from "./account.module.css";

export default function PushStatus() {
  const [permission, setPermission] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const handler = () => setPermission(Notification.permission);
    navigator.permissions?.query({ name: "notifications" }).then((status) => {
      status.addEventListener("change", handler);
      setPermission(Notification.permission);
    }).catch(() => {});
    return () => {
      navigator.permissions?.query({ name: "notifications" }).then((status) => {
        status.removeEventListener("change", handler);
      }).catch(() => {});
    };
  }, []);

  const on = permission === "granted";



  return (
    <div className={styles.row} style={{ marginTop: 10 }}>
      <div>
        <span className={styles.label}>Push notifications</span>
        <p className={styles.hint}>
          {on
            ? "Browser permission is granted. Confirm this device is subscribed using the setup prompt."
            : permission === "denied"
              ? "Browser notifications are blocked. Allow notifications for this site in your browser settings first."
              : "Enable browser alerts for messages and mentions. Your browser must ask for permission."}
        </p>
      </div>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => window.dispatchEvent(new Event("syw:enable-push"))}
      >
        {on ? "Finish setup" : permission === "denied" ? "Browser blocked" : "Enable"}
      </button>
    </div>
  );
}