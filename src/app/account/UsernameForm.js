"use client";

import { useState } from "react";
import styles from "./account.module.css";

const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;

export default function UsernameForm({ initialUsername }) {
  const [value, setValue] = useState(initialUsername || "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setNotice("");
    const username = value.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) {
      setError("Usernames are 3–24 characters using letters, numbers, dots, underscores or dashes.");
      return;
    }
    if (username === (initialUsername || "")) {
      setNotice("No changes to save.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        // A bodiless error (a crashed or proxy-generated 5xx) must not surface as
        // a raw JSON.parse message in the form.
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Could not save username (${res.status})`);
      }
      setValue(username);
      setSaved(true);
    } catch (err) {
      setError(err.message || "Could not save username");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Username</h2>
      <p className={styles.fieldHint} style={{ marginTop: -6, marginBottom: 14 }}>
        This is how members see you — @{value || "yourusername"} — instead of your email.
      </p>
      {saved && <p className={styles.formSaved}>Username saved.</p>}
      {notice && <p className={styles.formNotice}>{notice}</p>}
      {error && <p className={styles.formError}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="settings-username">Username</label>
          <input
            id="settings-username"
            className={styles.input}
            type="text"
            value={value}
            maxLength={24}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="e.g. yarnqueen"
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
              setNotice("");
            }}
          />
        </div>
        <button className={styles.manage} type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save username"}
        </button>
      </form>
    </section>
  );
}