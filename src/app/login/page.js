"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  completeSupabaseGoogle,
  loginWithGoogle,
  loginWithSupabaseEmail,
  reconcileSessionCookie,
  refreshSession,
  resendSignupVerification,
  sendPasswordReset,
} from "@/lib/client-auth";
import GoogleIcon from "@/components/GoogleIcon";
import PasswordInput from "@/components/PasswordInput";
import AuthAside from "@/components/AuthAside";
import styles from "../auth.module.css";

const LANDING_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

function BrandMark() {
  return (
    <p className={styles.brand}>
      <a className={styles.brandLink} href={LANDING_URL}>
        <Image src="/brand/secretyarnery-logo.webp" alt="" width={90} height={28} className={styles.brandLogo} />
        <span className={styles.brandWord}>Secret Yarnery</span>
      </a>
    </p>
  );
}

export default function LoginPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState("");
  const [resent, setResent] = useState(false);

  // Already signed in? Bounce straight into the app instead of re-showing the
  // auth form (the "auth wall"). If the cookie's access token has expired, the
  // reconcile helper rotates it via /api/auth/refresh first, so a live session
  // never strands a member on the form. Skipped on the Google OAuth /
  // session-refresh return paths, where the page's own finalizer handles the
  // session.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("session_refresh") || params.has("provider")) return;
    let cancelled = false;
    (async () => {
      const signedIn = await reconcileSessionCookie();
      if (!cancelled && signedIn) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so server components read the (possibly rotated) session cookie
        window.location.assign("/dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("session_refresh")) {
      let cancelled = false;
      (async () => {
        const refreshed = await refreshSession();
        if (!cancelled && refreshed) {
          // Full reload so server-rendered pages read the fresh Firestore doc.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the new subscription is re-rendered
          window.location.assign("/dashboard");
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (params.has("provider")) {
      // Returned from the Google OAuth redirect; exchange the Supabase session
      // for the httpOnly cookie (legacy Firebase Google members are linked
      // server-side) and reload into the app.
      let cancelled = false;
      (async () => {
        try {
          const ok = await completeSupabaseGoogle();
          if (!cancelled && ok) {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the fresh session cookie is sent
            window.location.assign("/dashboard");
          }
        } catch (err) {
          if (!cancelled) {
            if (err.code === "not_prepaid" && err.redirect) {
              window.location.assign(err.redirect);
            } else {
              setError(err.message || t("googleFailed"));
            }
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [t]);

  async function resendVerification() {
    setBusy("verify");
    setError("");
    try {
      await resendSignupVerification(email);
      setResent(true);
    } catch (err) {
      setError(err.message || "Could not resend verification email");
    } finally {
      setBusy("");
    }
  }

  async function handleGoogle() {
    setError("");
    setVerifyNotice("");
    setBusy("google");
    try {
      // Full-page Google OAuth redirect through Supabase; the mount-time
      // completeSupabaseGoogle() finalizer exchanges the session on return.
      await loginWithGoogle();
    } catch (err) {
      setError(err.message || t("googleFailed"));
      setBusy("");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setVerifyNotice("");
    setBusy("email");
    try {
      await loginWithSupabaseEmail(email, password);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the fresh session cookie is sent
      window.location.assign("/dashboard");
    } catch (err) {
      if (err.code === "email_not_verified" || err.code === "email_not_confirmed") {
        setVerifyNotice(err.message);
        setResent(false);
      } else {
        setError(err.message || "Sign-in failed");
      }
    } finally {
      setBusy("");
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    setBusy("reset");
    try {
      await sendPasswordReset(email);
      setResetSent(true);
    } catch (err) {
      setError(err.message || "Failed to send reset email");
    } finally {
      setBusy("");
    }
  }

  if (forgotPassword) {
    return (
      <main className={styles.page}>
        <div className={styles.authContainer}>
          <div className={styles.authForm}>
            <a className={styles.backLink} href={LANDING_URL}>
              ← {t("backToLanding")}
            </a>
            <p className={styles.brand}><a className={styles.brandLink} href={LANDING_URL}>
              <Image src="/brand/secretyarnery-logo.webp" alt="" width={90} height={28} className={styles.brandLogo} />
              <span className={styles.brandWord}>Secret Yarnery</span>
            </a></p>
            <h1 className={styles.title}>{t("resetPassword")}</h1>
            <p className={styles.subtitle}>{t("resetPasswordDesc")}</p>

            {resetSent ? (
              <p className={styles.success}>{t("resetSent", { email })}</p>
            ) : (
              <>
                {error && <p className={styles.error}>{error}</p>}
                {verifyNotice && (
                  <div className={styles.verifyBox}>
                    <p className={styles.verifyText}>{verifyNotice}</p>
                    {resent ? (
                      <p className={styles.verifyText}>{t("verificationResent")}</p>
                    ) : (
                      <button
                        className={styles.linkBtn}
                        onClick={resendVerification}
                        disabled={!!busy}
                      >
                        {busy === "verify" ? t("resending") : t("resendVerification")}
                      </button>
                    )}
                  </div>
                )}
                <form onSubmit={handleReset}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="reset-email">{t("email")}</label>
                    <input
                      id="reset-email"
                      className={styles.input}
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <button className={styles.submit} type="submit" disabled={!!busy}>
                    {busy === "reset" ? t("resending") : t("sendResetLink")}
                  </button>
                </form>
              </>
            )}

            <p className={styles.footer}>
              <a className={styles.link} href="/login" onClick={(e) => { e.preventDefault(); setForgotPassword(false); setResetSent(false); setError(""); }}>
                {t("backToSignIn")}
              </a>
            </p>
          </div>
<AuthAside />
      </div>

      {busy && (
        <div className={styles.loadOverlay} role="status" aria-live="polite">
          <div className={styles.spinner} />
          <p className={styles.loadText}>{busy === "verify" ? t("resending") : t("sendResetLink")}</p>
        </div>
      )}
    </main>
  );
}

  if (busy === "email" || busy === "google") {
    return (
      <main className={styles.page}>
        <div className={styles.authContainer}>
          <div className={styles.authForm}>
            <BrandMark />
            <div className={styles.signingIn} role="status" aria-live="polite">
              <div className={styles.spinner} />
              <p className={styles.loadText}>{t("signingIn")}</p>
            </div>
          </div>
          <AuthAside />
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.authContainer}>
        <div className={styles.authForm}>
          <a className={styles.backLink} href={LANDING_URL}>
            ← {t("backToLanding")}
          </a>
          <BrandMark />
          <h1 className={styles.title}>{t("welcomeBack")}</h1>
          <p className={styles.subtitle}>{t("signInToJoin")}</p>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.googleButton} onClick={handleGoogle} disabled={!!busy}>
            <GoogleIcon /> {t("continueWithGoogle")}
          </button>

          <div className={styles.divider}>{tc("or")}</div>

          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">{t("email")}</label>
              <input
                id="email"
                className={styles.input}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <PasswordInput
              id="password"
              label={t("password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              showRules={false}
            />
            <button className={styles.submit} type="submit" disabled={!!busy}>
              {busy === "email" ? t("signingIn") : t("signIn")}
            </button>
          </form>

          <p className={styles.forgot}>
            <a className={styles.link} href="/login" onClick={(e) => { e.preventDefault(); setForgotPassword(true); setError(""); }}>
              {t("forgotPassword")}
            </a>
          </p>

          <p className={styles.footer}>
            {t("newHere")} <a className={styles.link} href="/signup">{t("createAccountLink")}</a>
          </p>
        </div>
        <AuthAside />
      </div>
    </main>
  );
}
