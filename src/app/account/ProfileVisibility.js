"use client";

import { useState } from "react";
import styles from "./account.module.css";

export default function ProfileVisibility({ value = "public" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visibility, setVisibility] = useState(value === "private" ? "private" : "public");

  async function set(next) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileVisibility: next }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Could not update your visibility");
        return;
      }
      setVisibility(next);
    } catch {
      setError("Could not update your visibility");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.row}>
      <div>
        <span className={styles.label}>Profile visibility</span>
        <p className={styles.hint}>
          {visibility === "public"
            ? "Your profile is listed in the members directory and visible to other members."
            : "Your profile won't appear in the members directory or similar-member suggestions. Members you message or match with can still see it."}
        </p>
      </div>
      <button
        type="button"
        className={visibility === "public" ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
        onClick={() => set(visibility === "public" ? "private" : "public")}
        disabled={busy}
        aria-pressed={visibility === "public"}
        aria-label={visibility === "public" ? "Make profile private" : "Make profile public"}
      >
        {visibility === "public" ? "Public" : "Private"}
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}