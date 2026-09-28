"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  completeSupabaseGoogle,
  signupWithGoogle,
  signupWithSupabaseEmail,
  reconcileSessionCookie,
  refreshSession,
  checkPaidSignup,
  resendSignupVerification,
} from "@/lib/client-auth";
import { isOAuthReturn, isStaleProviderLink } from "@/lib/oauth-return";
import GoogleIcon from "@/components/GoogleIcon";
import PasswordInput from "@/components/PasswordInput";
import AuthAside from "@/components/AuthAside";
import styles from "../auth.module.css";

const LANDING_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

// A `?provider=google` link with no return material behind it: a bookmark, a
// shared link, a reload after the tokens were spent. It is not a failed sign-up
// — there was never a sign-up to fail — so it releases the spinner without an
// error the visitor cannot act on.
//
// Derived from the URL rather than latched into state, so it stays consistent
// across re-renders, and the server snapshot stays false because the marker is
// in the query string while the credentials would be in the fragment: the server
// cannot see either. One frame of the spinner on a stale link is the cost.
function subscribeStaleProvider() {
  return () => {};
}
function getStaleProviderSnapshot() {
  return isStaleProviderLink();
}
function getServerStaleProviderSnapshot() {
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

export default function SignupForm({ oauthPending = false, hasSession = false }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [verifyEmail, setVerifyEmail] = useState("");
  const [resent, setResent] = useState(false);
  const [acceptedToS, setAcceptedToS] = useState(false);
  const [tosError, setTosError] = useState(false);

  // True on the Google OAuth return leg, before the effect finishes exchanging
  // the session. Renders the centered signing-in state immediately. Passed in by
  // the server shell so it is already correct in the SSR HTML; oauthFailed drops
  // it once the exchange gives up, since the prop can't change on its own.
  const [oauthFailed, setOauthFailed] = useState(false);
  // Releases the spinner for a ?provider= link with nothing to redeem. Derived
  // rather than state — see getStaleProviderSnapshot above.
  const staleProvider = useSyncExternalStore(
    subscribeStaleProvider,
    getStaleProviderSnapshot,
    getServerStaleProviderSnapshot
  );
  const waitingOnOAuth = oauthPending && !oauthFailed && !staleProvider;

  // A returning member (the server saw a session cookie) is about to be bounced
  // into the app by the auth wall below. That check costs up to three round
  // trips, so the signing-in screen covers it rather than flashing the sign-up
  // form at someone who already has an account. Newcomers (no cookie) skip
  // straight to the form.
  const [wallChecked, setWallChecked] = useState(false);
  const resolvingWall = hasSession && !wallChecked;

  // Already signed in? Bounce straight into the app instead of re-showing the
  // signup form (the "auth wall"). If the cookie's access token has expired, the
  // reconcile helper rotates it via /api/auth/refresh first, so a live session
  // never strands a member on the form. Skipped on the Google OAuth /
  // session-refresh return paths, where the page's own finalizer handles the
  // session.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Skip the wall only for a *live* OAuth return, so someone who arrives on a
    // stale ?provider= link with a valid cookie is still bounced into the app.
    if (params.has("session_refresh") || isOAuthReturn()) return;
    // The server already read the httpOnly cookie and reported it as hasSession.
    // With no cookie there is nothing for the wall to heal, so skip the two
    // guaranteed 401s (/api/me, then /api/auth/refresh) that every anonymous
    // visit used to pay for. resolvingWall is already false without a cookie.
    if (!hasSession) return;
    let cancelled = false;
    (async () => {
      const signedIn = await reconcileSessionCookie();
      if (cancelled) return;
      if (signedIn) {
        // Assigned before any state update on purpose: this document keeps
        // rendering until /signing-in commits, so re-rendering here would flash
        // the sign-up form mid-handoff.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so server components read the (possibly rotated) session cookie
        window.location.assign("/signing-in");
      } else {
        // No usable server session — the sign-up form is the right screen.
        setWallChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const prefill = new URLSearchParams(window.location.search).get("email");
      if (prefill) setEmail(prefill);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("session_refresh")) return;
    let cancelled = false;
    (async () => {
      const refreshed = await refreshSession();
      if (!cancelled && refreshed) {
        // Full reload so server-rendered pages read the fresh session cookie.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the new subscription is re-rendered
        window.location.assign("/signing-in");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("provider")) return;
    // The marker alone is not a return leg. With no return material there is no
    // session to exchange, so skip the retry window and show the form —
    // isStaleProviderLink() has already released the spinner, so nothing to set.
    if (!isOAuthReturn()) return;
    // Returned from the Google OAuth redirect; exchange the Supabase session
    // for the httpOnly cookie and reload into the app.
    let cancelled = false;
    (async () => {
      try {
        const ok = await completeSupabaseGoogle();
        if (!cancelled && ok) {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the fresh session cookie is sent
          window.location.assign("/signing-in");
        } else if (!cancelled) {
          // OAuth finished on a different origin and 308'd us here without a
          // recoverable session (stale host flow). Release the stuck param so
          // the form is usable again.
          window.history.replaceState({}, "", "/signup");
          setOauthFailed(true);
          setError(t("googleFailed"));
        }
      } catch (err) {
        if (!cancelled) {
          if (err.code === "not_prepaid" && err.redirect) {
            window.location.assign(err.redirect);
          } else {
            // Release the provider param so the form shows again with the
            // error instead of staying on the spinner forever.
            window.history.replaceState({}, "", "/signup");
            setOauthFailed(true);
            setError(err.message || t("googleFailed"));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function handleGoogle() {
    setError("");
    setBusy("google");
    try {
      // Full-page Google OAuth redirect through Supabase; the mount-time
      // completeSupabaseGoogle() finalizer exchanges the session on return.
      await signupWithGoogle();
    } catch (err) {
      setError(err.message || t("googleFailed"));
      setBusy("");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!acceptedToS) {
      setTosError(true);
      setError(t("tosRequired"));
      return;
    }
    setTosError(false);
    setBusy("email");
    let navigated = false;
    try {
      // The signup wall: only paid Speakeasy checkout emails may register.
      // Checked BEFORE any account is created; blocked emails are sent to the
      // speakeasy page to purchase a membership.
      await checkPaidSignup(email);
      const result = await signupWithSupabaseEmail(name, email, password);
      if (result && result.confirm) {
        setVerifyEmail(email);
        setResent(false);
      } else {
        navigated = true;
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the fresh session cookie is sent
        window.location.assign("/signing-in");
      }
    } catch (err) {
      if (err.code === "not_prepaid" || err.code === "expired") {
        if (err.redirect) {
          window.location.assign(err.redirect);
          return;
        }
        setError(err.message || t("onlyPaidMembers"));
      } else if (err.code === "email_not_verified" || err.code === "email_not_confirmed") {
        setVerifyEmail(email);
        setResent(false);
      } else {
        setError(err.message || t("signupFailed"));
      }
    } finally {
      if (!navigated) setBusy("");
    }
  }

  async function resendVerification() {
    setBusy("verify");
    setError("");
    try {
      await resendSignupVerification(verifyEmail || email);
      setResent(true);
    } catch (err) {
      setError(err.message || "Could not resend verification email");
    } finally {
      setBusy("");
    }
  }

  if (verifyEmail) {
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
            <h1 className={styles.title}>{t("verifyEmail")}</h1>
            <div className={styles.verifyBox}>
              <p className={styles.verifyText}>
                {t("verifyEmailDesc", { email: verifyEmail })}
              </p>
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
            {error && <p className={styles.error}>{error}</p>}
            <p className={styles.footer}>
              <a className={styles.link} href="/login">{t("signInAfterVerify")}</a>
            </p>
          </div>
          <AuthAside />
        </div>
      </main>
    );
  }

  if (resolvingWall || busy === "email" || busy === "google" || waitingOnOAuth) {
    return (
      <main className={styles.signingInScreen}>
        <BrandMark />
        <div className={styles.signingIn} role="status" aria-live="polite">
          <div className={styles.spinner} />
          <p className={styles.loadText}>
            {resolvingWall ? t("signingIn") : busy === "email" ? t("creatingAccount") : "Preparing your sign-in…"}
          </p>
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
          <h1 className={styles.title}>{t("createAccount")}</h1>
          <p className={styles.subtitle}>{t("startConnecting")}</p>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.googleButton} onClick={handleGoogle} disabled={!!busy}>
            <GoogleIcon /> {t("continueWithGoogle")}
          </button>

          <div className={styles.divider}>{tc("or")}</div>

          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="name">{t("name")}</label>
              <input
                id="name"
                className={styles.input}
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
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
              autoComplete="new-password"
            />
            <div className={styles.tosField}>
                <label className={styles.tosLabel}>
                  <input
                    className={styles.tosCheckbox}
                    type="checkbox"
                    checked={acceptedToS}
                    required
                    aria-invalid={tosError}
                    onChange={(e) => {
                      setAcceptedToS(e.target.checked);
                      if (e.target.checked) setTosError(false);
                    }}
                  />
                  <span>
                    {t.rich("tosCheckbox", {
                      terms: (chunks) => <Link className={styles.link} href="/terms">{chunks}</Link>,
                    })}
                  </span>
                </label>
                {tosError && (
                  <p className={styles.tosError} role="alert">{t("tosRequired")}</p>
                )}
              </div>
            <button className={styles.submit} type="submit" disabled={!!busy}>
              {busy === "email" ? t("creatingAccount") : t("createAccountBtn")}
            </button>
          </form>

          <p className={styles.footer}>
            {t("alreadyMember")} <a className={styles.link} href="/login">{t("signInLink")}</a>
          </p>
        </div>
        <AuthAside />
      </div>
    </main>
  );
}
