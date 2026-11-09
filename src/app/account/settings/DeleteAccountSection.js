"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../account.module.css";
import { supabase } from "@/lib/supabase";

export default function DeleteAccountSection({ email }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendVerificationCode() {
    setError("");
    setSendingCode(true);
    try {
      const response = await fetch("/api/me/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "send-code" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send the verification email.");
      setCodeSent(true);
    } catch (err) {
      setError(err.message || "Could not send the verification email. Try again.");
    } finally {
      setSendingCode(false);
    }
  }
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
        body: JSON.stringify({ emailCode, confirmation }),
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
            <p className={styles.fieldHint}>We will send a one-time verification code to {email}. This confirms that you control the account email.</p>
            <button type="button" className={styles.deleteCancel} onClick={sendVerificationCode} disabled={sendingCode || !email}>
              {sendingCode ? "Sending code…" : codeSent ? "Resend verification code" : "Send verification code"}
            </button>
          </div>
          {codeSent && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="delete-email-code">Email verification code</label>
              <input
                id="delete-email-code"
                className={styles.input}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                required
              />
            </div>
          )}
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
            <button type="submit" className={styles.deleteButton} disabled={busy || confirmation !== "DELETE" || !/^\d{6,8}$/.test(emailCode)}>
              {busy ? "Deleting account…" : "Permanently delete account"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
