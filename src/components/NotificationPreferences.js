"use client";

import { useState, useEffect } from "react";
import styles from "./NotificationPreferences.module.css";

const PREF_KEYS = [
  { key: "chat", label: "Chat messages", hint: "Direct messages and lounge chat" },
  { key: "feed", label: "Feed activity", hint: "Comments, likes on your posts" },
  { key: "events", label: "Events", hint: "Event reminders and updates" },
  { key: "mentions", label: "Mentions", hint: "When someone @mentions you" },
  { key: "automations", label: "Automations", hint: "Digest emails and automated notifications" },
];

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me/notifications/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setPrefs(d);
      })
      .catch(() => {});
  }, []);

  function toggle(key) {
    setPrefs((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev));
    setSaved(false);
  }

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/me/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Could not save preferences");
        return;
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) {
    return <p style={{ fontSize: 13, color: "#9b9bab" }}>Loading preferences...</p>;
  }

  return (
    <div>
      {PREF_KEYS.map(({ key, label, hint }) => (
        <div key={key} className={styles.row}>
          <div>
            <span className={styles.label}>{label}</span>
            <p className={styles.hint}>{hint}</p>
          </div>
          <button
            type="button"
            className={prefs[key] ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
            onClick={() => toggle(key)}
            aria-pressed={!!prefs[key]}
          >
            {prefs[key] ? "On" : "Off"}
          </button>
        </div>
      ))}
      {error && <p className={styles.error}>{error}</p>}
      {saved && <p className={styles.formSaved}>Preferences saved.</p>}
      <button
        className={styles.manage}
        onClick={handleSave}
        disabled={saving}
        style={{ marginTop: 16 }}
      >
        {saving ? "Saving..." : "Save preferences"}
      </button>
    </div>
  );
}
