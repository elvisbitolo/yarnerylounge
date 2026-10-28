"use client";

import { useState, useEffect } from "react";
import styles from "./NotificationPreferences.module.css";

const IN_APP_KEYS = [
  { key: "chat", label: "Chat messages", hint: "Direct messages and lounge chat" },
  { key: "feed", label: "Feed activity", hint: "Comments, likes on your posts" },
  { key: "events", label: "Events", hint: "Event reminders, and when the owner goes live in a lounge" },
  { key: "mentions", label: "Mentions", hint: "When someone @mentions you" },
  { key: "automations", label: "Automations", hint: "Automated in-app notifications" },
  { key: "watch", label: "Watched members", hint: "When someone you're watching comes online or enters a lounge" },
];

const EMAIL_KEYS = [
  { key: "emailMessages", label: "Messages and mentions", hint: "Email when you receive direct messages or are mentioned in chat" },
  { key: "emailEvents", label: "Events and recordings", hint: "Event reminders and recording-ready emails" },
  { key: "emailMatches", label: "Daily Match", hint: "Email when your new Daily Match is available" },
  { key: "emailCommunity", label: "Community activity", hint: "Optional email about follows and other community activity" },
  { key: "emailDigest", label: "Weekly community digest", hint: "A weekly roundup of posts and upcoming events" },
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
      .catch(() => setError("Could not load notification preferences."));
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save preferences");
        return;
      }
      setPrefs(data);
      setSaved(true);
    } catch {
      setError("Network error. Your preferences were not saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) {
    return <p style={{ fontSize: 13, color: "#9b9bab" }}>Loading preferences...</p>;
  }

  function renderRows(items) {
    return items.map(({ key, label, hint }) => (
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
    ));
  }

  return (
    <div>
      <h3>In-app and push notifications</h3>
      {renderRows(IN_APP_KEYS)}
      <h3 style={{ marginTop: 28 }}>Email notifications</h3>
      <p className={styles.hint}>Choose which optional emails you receive. Essential account-security emails may still be sent.</p>
      {renderRows(EMAIL_KEYS)}
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
