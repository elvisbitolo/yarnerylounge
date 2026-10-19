"use client";

import { useState } from "react";
import { STRENGTH_LABELS, passwordStrength, validatePasswordChange } from "@/lib/password-policy";
import styles from "../account.module.css";

// The spot for "change your password and make it stronger" — every member who
// was handed a temporary password resets it here without leaving the app.
export default function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const score = passwordStrength(next);

  function resetMessages() {
    setSaved(false);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);

    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    const policyError = validatePasswordChange({ currentPassword: current, newPassword: next });
    if (policyError) {
      setError(policyError);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Could not change the password (${res.status})`);
      setCurrent("");
      setNext("");
      setConfirm("");
      setSaved(true);
    } catch (err) {
      setError(err.message || "Could not change the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Change password</h2>
      <p className={styles.fieldHint} style={{ marginTop: -6, marginBottom: 14 }}>
        Pick something only you know — at least 8 characters with a letter and a number or
        symbol. Longer is stronger.
      </p>
      {saved && <p className={styles.formSaved}>Password changed. Use it the next time you sign in.</p>}
      {error && <p className={styles.formError}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="settings-current-password">
            Current password
          </label>
          <input
            id="settings-current-password"
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              resetMessages();
            }}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="settings-new-password">
            New password
          </label>
          <input
            id="settings-new-password"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              resetMessages();
            }}
          />
          {next && (
            <div className={styles.fieldHint} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span
                aria-hidden="true"
                style={{
                  display: "flex",
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.12)",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    width: `${(score / 4) * 100}%`,
                    height: "100%",
                    background: score >= 4 ? "#22c55e" : score >= 3 ? "#3b82f6" : score >= 2 ? "#f59e0b" : "#ef4444",
                    transition: "width 0.2s ease",
                  }}
                />
              </span>
              <span style={{ fontWeight: 700 }}>{STRENGTH_LABELS[score]}</span>
            </div>
          )}
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="settings-confirm-password">
            Confirm new password
          </label>
          <input
            id="settings-confirm-password"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              resetMessages();
            }}
          />
        </div>
        <button className={styles.manage} type="submit" disabled={busy}>
          {busy ? "Changing…" : "Change password"}
        </button>
      </form>
    </section>
  );
}
