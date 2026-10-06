"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { logout } from "@/lib/client-auth";
import { TOS_VERSION } from "@/lib/tos";
import styles from "../auth.module.css";

// The only place a member can satisfy the consent gate. The copy is
// deliberately explicit about the physical action — "tick the box below" —
// because this screen is a dead end: there is no Continue, no Skip, nothing to
// click that gets past it except the tick itself, and a member who does not
// realise that has nowhere to go.
export default function ConsentForm() {
  const t = useTranslations("auth");
  const [accepted, setAccepted] = useState(false);
  const [tosError, setTosError] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!accepted) {
      setTosError(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true, version: TOS_VERSION }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error === "terms_consent_required" ? t("tosRequired") : data.error);
      }
      // Full reload so every server-rendered page re-reads the now-accepted
      // row; getCurrentUser() refuses this member until it does.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so server components re-read the consent row
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err.message || t("consentFailed"));
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await logout();
    } finally {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload drops the session cookie
      window.location.assign("/login");
    }
  }

  return (
    <div className={styles.authContainer}>
      <div className={styles.authForm}>
        <p className={styles.brand}>
          <span className={styles.brandWord}>Secret Yarnery</span>
        </p>

        <h1 className={styles.title}>{t("consentTitle")}</h1>
        <p className={styles.subtitle}>{t("consentIntro")}</p>

        {/* The instruction, in its own paragraph: what to read, what to tick,
            and what happens if they do not. */}
        <p className={styles.subtitle}>{t("consentHow")}</p>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.tosField}>
            <label className={styles.tosLabel}>
              <input
                className={styles.tosCheckbox}
                type="checkbox"
                checked={accepted}
                required
                aria-invalid={tosError}
                onChange={(e) => {
                  setAccepted(e.target.checked);
                  if (e.target.checked) setTosError(false);
                }}
              />
              <span>
                {t.rich("tosCheckbox", {
                  terms: (chunks) => (
                    <Link className={styles.link} href="/terms">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>
            {tosError && (
              <p className={styles.tosError} role="alert">
                {t("tosRequired")}
              </p>
            )}
          </div>

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? t("consentWorking") : t("consentSubmit")}
          </button>
        </form>

        <p className={styles.subtitle}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={handleSignOut}
            disabled={busy}
          >
            {t("consentSignOut")}
          </button>
        </p>
      </div>
    </div>
  );
}
