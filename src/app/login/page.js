"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  completePasswordRecovery,
  completeSupabaseGoogle,
  isPasswordRecovery,
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

function subscribeRecovery() {
  return () => {};
}
function getRecoverySnapshot() {
  return isPasswordRecovery();
}
function getServerRecoverySnapshot() {
  return false;
}

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
  const [confirmPassword, setConfirmPassword] = useState("");

  // Landed from the password-reset email? The Supabase recovery session lives
  // in the URL hash — show the "choose a new password" form instead of the
  // login form. useSyncExternalStore keeps hydration clean (server renders the
  // login shell; the client swaps to the recovery form afterwards).
  const recovering = useSyncExternalStore(
    subscribeRecovery,
    getRecoverySnapshot,
    getServerRecoverySnapshot
  );

  // Already signed in? Bounce straight into the app instead of re-showing the
  // auth form (the "auth wall"). If the cookie's access token has expired, the
  // reconcile helper rotates it via /api/auth/refresh first, so a live session
  // never strands a member on the form. Skipped on the Google OAuth /
  // session-refresh / password-recovery paths, where the page's own handler
  // deals with the session.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("session_refresh") || params.has("provider") || isPasswordRecovery()) return;
    let cancelled = false;
    (async () => {
      const signedIn = await reconcileSessionCookie();
      if (!cancelled && signedIn) {
        // Full reload lands the fresh session cookie; the signing-in screen
        // keeps the transition looking smooth while server components load.
        window.location.assign("/signing-in");
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
          // Full reload so server components read the freshly rotated cookie;
          // signing-in screen keeps the handoff feeling seamless.
          window.location.assign("/signing-in");
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (params.has("provider")) {
      // Returned from the Google OAuth redirect; exchange the Supabase session
      // for the httpOnly cookie and reload into the app.
      let cancelled = false;
      (async () => {
        try {
          const ok = await completeSupabaseGoogle();
          if (!cancelled && ok) {
            // Signing-in screen keeps the post-OAuth handoff feeling smooth
            // while the fresh session cookie is read server-side.
            window.location.assign("/signing-in");
          } else if (!cancelled) {
            // OAuth finished on a different origin and 308'd us here without a
            // recoverable session (stale host flow). Release the stuck param so
            // the form is usable again.
            window.history.replaceState({}, "", "/login");
            setError(t("googleFailed"));
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
      // Full reload so the fresh session cookie is read server-side; the
      // signing-in screen keeps the transition from feeling like a delay.
      window.location.assign("/signing-in");
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

  async function handleRecovery(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordsMismatch"));
      return;
    }
    setBusy("recovery");
    try {
      const ok = await completePasswordRecovery(password);
      if (ok) {
        // Full reload so the fresh session cookie is read server-side.
        window.location.assign("/signing-in");
      } else {
        setError(t("recoveryInvalid"));
      }
    } catch (err) {
      setError(err.message || t("recoveryInvalid"));
    } finally {
      setBusy("");
    }
  }

  if (recovering) {
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
            <h1 className={styles.title}>{t("chooseNewPassword")}</h1>
            <p className={styles.subtitle}>{t("recoveryDesc")}</p>

            {error && <p className={styles.error}>{error}</p>}

            <form onSubmit={handleRecovery}>
              <PasswordInput
                id="new-password"
                label={t("newPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <PasswordInput
                id="confirm-password"
                label={t("confirmPassword")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                showRules={false}
              />
              <button className={styles.submit} type="submit" disabled={!!busy}>
                {busy === "recovery" ? t("signingIn") : t("updatePassword")}
              </button>
            </form>

            <p className={styles.footer}>
              <a
                className={styles.link}
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.assign("/login");
                }}
              >
                {t("backToSignIn")}
              </a>
            </p>
          </div>
          <AuthAside />
        </div>

        {busy && (
          <div className={styles.loadOverlay} role="status" aria-live="polite">
            <div className={styles.spinner} />
            <p className={styles.loadText}>{t("signingIn")}</p>
          </div>
        )}
      </main>
    );
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
