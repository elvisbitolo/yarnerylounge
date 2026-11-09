"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../account.module.css";
import { supabase } from "@/lib/supabase";

export default function DeleteAccountSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete(event) {
    event.preventDefault();
    setError("");
    if (confirmation !== "DELETE") {
      setError('Type DELETE exactly to confirm.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/me/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ currentPassword: password, confirmation }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Account deletion could not be completed.");

      // Clear any browser-side Supabase session as well as the server cookie.
      await supabase.auth.signOut().catch(() => {});
      router.replace("/login?account_deleted=1");
      router.refresh();
    } catch (err) {
      setError(err.message || "Account deletion could not be completed.");
      setBusy(false);
    }
  }

  return (
    <section className={styles.deleteAccount}>
      <h2 className={styles.deleteTitle}>Delete account</h2>
      <p className={styles.deleteCopy}>
        Permanently close your sign-in account and remove personal profile information. Your public posts,
        comments and discussion contributions will remain where needed for community continuity, but will
        display as “Former member”. Private account activity and device subscriptions will be removed.
      </p>
      <p className={styles.deleteWarning}>
        This cannot be undone. Any active Shopify membership must be cancelled separately first.
        Account deletion does not cancel external billing.
      </p>

      {!open ? (
        <button type="button" className={styles.deleteButton} onClick={() => setOpen(true)}>
          Delete my account
        </button>
      ) : (
        <form onSubmit={handleDelete}>
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="delete-current-password">Current password</label>
            <input
              id="delete-current-password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={1}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="delete-confirmation">
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirmation"
              className={styles.input}
              type="text"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </div>
          <div className={styles.deleteActions}>
            <button type="button" className={styles.deleteCancel} onClick={() => { setOpen(false); setError(""); }}>
              Keep my account
            </button>
            <button type="submit" className={styles.deleteButton} disabled={busy || confirmation !== "DELETE" || !password}>
              {busy ? "Deleting account…" : "Permanently delete account"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
