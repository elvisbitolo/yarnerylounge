"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  completeOAuthReturn,
  completePasswordRecovery,
  isPasswordRecovery,
  loginWithOAuthProvider,
  loginWithSupabaseEmail,
  reconcileSessionCookie,
  refreshSession,
  resendSignupVerification,
  sendPasswordReset,
} from "@/lib/client-auth";
import { isOAuthReturn, isStaleProviderLink } from "@/lib/oauth-return";
import { oauthFailedKey } from "@/lib/oauth-providers";
import FacebookIcon from "@/components/FacebookIcon";
import LinkedInIcon from "@/components/LinkedInIcon";
import TwitchIcon from "@/components/TwitchIcon";
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

// A `?provider=google` link with no return material behind it: a bookmark, a
// shared link, a reload after the tokens were spent. It is not a failed sign-in
// — there was never a sign-in to fail — so it releases the spinner without an
// error the member cannot act on.
//
// Same shape as the recovery check: the server genuinely cannot see this, because
// the marker is in the query string and the credentials would be in the
// fragment, so the server snapshot stays false and the client takes over after
// hydration. That costs one frame of the spinner on a stale link, which is the
// unavoidable price of the marker not being visible server-side.
function subscribeStaleProvider() {
  return () => {};
}
function getStaleProviderSnapshot() {
  return isStaleProviderLink();
}
function getServerStaleProviderSnapshot() {
  return false;
}

// Name only, no mark beside it. The full lockup (image + text) is used by the
// navs, /signup, /terms and /community, but on the auth screens the pair reads
// as two brand elements stacked above the form, and the same BrandMark serves
// the "Preparing your sign-in…" handoff screen, where a mark is just noise.
function BrandMark() {
  return (
    <p className={styles.brand}>
      <a className={styles.brandLink} href={LANDING_URL}>
        <span className={styles.brandWord}>Secret Yarnery</span>
      </a>
    </p>
  );
}

export default function LoginForm({ oauthPending = false, hasSession = false }) {
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
  // trips, so the signing-in screen covers it — otherwise the form and its
  // "New here? Create an account" link sit on screen for a member who is never
  // going to use them. Anonymous visitors (no cookie) skip straight to the form.
  const [wallChecked, setWallChecked] = useState(false);
  const resolvingWall = hasSession && !wallChecked;

  const [noAccount, setNoAccount] = useState(false);

  // Already signed in? Bounce straight into the app instead of re-showing the
  // auth form (the "auth wall"). If the cookie's access token has expired, the
  // reconcile helper rotates it via /api/auth/refresh first, so a live session
  // never strands a member on the form. Skipped on the Google OAuth /
  // session-refresh / password-recovery paths, where the page's own handler
  // deals with the session.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Skip the wall only for a *live* OAuth return. A stale ?provider= link
    // carries no session of its own, so a member arriving on one of those with a
    // valid cookie should still be bounced into the app rather than shown the
    // form they came here to escape.
    if (params.has("session_refresh") || isOAuthReturn() || isPasswordRecovery()) return;
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
        // Full reload lands the fresh session cookie; the signing-in screen
        // keeps the transition looking smooth while server components load.
        // Assigned before any state update on purpose: this document keeps
        // rendering until /signing-in commits, so re-rendering here would flash
        // the form at the member mid-handoff.
        window.location.assign("/signing-in");
      } else {
        // Dead/absent server session — the form is the right screen after all.
        setWallChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

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
      // The marker alone is not a return leg. Without return material in the URL
      // there is no session to exchange, so skip the retry window entirely and
      // let the form render — isStaleProviderLink() already released the
      // spinner for it, so there is nothing to set here.
      if (!isOAuthReturn()) return;
      // Returned from an OAuth redirect (Google, Facebook, ...); exchange the
      // Supabase session for the httpOnly cookie and reload into the app. The
      // oauthPending snapshot above already shows the centered signing-in state,
      // so this exchange runs behind an instant spinner — never a bare form.
      // The marker says which provider came back, so the failure below names the
      // right one instead of always blaming Google.
      const failedKey = oauthFailedKey(params.get("provider"));
      let cancelled = false;
      (async () => {
        try {
          const ok = await completeOAuthReturn();
          if (!cancelled && ok) {
            // Signing-in screen keeps the post-OAuth handoff feeling smooth
            // while the fresh session cookie is read server-side.
            window.location.assign("/signing-in");
          } else if (!cancelled) {
            // OAuth finished on a different origin and 308'd us here without a
            // recoverable session (stale host flow). Release the stuck param so
            // the form is usable again.
            window.history.replaceState({}, "", "/login");
            setOauthFailed(true);
            setError(t(failedKey));
          }
        } catch (err) {
          if (!cancelled) {
            if (err.code === "not_prepaid" && err.redirect) {
              window.location.assign(err.redirect);
            } else if (err.code === "not_prepaid") {
              // The provider account isn't (and can't) be registered as a member
              // yet — say so plainly and point at sign-up instead of leaving
              // the member guessing on a dismissed error.
              window.history.replaceState({}, "", "/login");
              setOauthFailed(true);
              setNoAccount(true);
            } else {
              // Release the provider param so the form shows again with the
              // error instead of staying on the spinner forever.
              window.history.replaceState({}, "", "/login");
              setOauthFailed(true);
              setError(err.message || t(failedKey));
            }
          }
        } finally {
          if (!cancelled) setBusy("");
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

  // Provider buttons share one handler: the only per-provider difference is
  // which authorize options get sent, and that lives in client-auth.js.
  async function handleProvider(provider) {
    setError("");
    setVerifyNotice("");
    setNoAccount(false);
    setBusy(provider);
    try {
      // Full-page OAuth redirect through Supabase; the mount-time
      // completeOAuthReturn() finalizer exchanges the session on return.
      await loginWithOAuthProvider(provider);
    } catch (err) {
      setError(err.message || t(oauthFailedKey(provider)));
      setBusy("");
    }
  }

  async function handleGoogle() {
    return handleProvider("google");
  }

  async function handleFacebook() {
    return handleProvider("facebook");
  }

  async function handleLinkedIn() {
    return handleProvider("linkedin");
  }

  async function handleTwitch() {
    return handleProvider("twitch");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setVerifyNotice("");
    setBusy("email");
    // location.assign() only queues the navigation — this document keeps
    // rendering until the new one commits. Clearing busy here would swap the
    // signing-in screen straight back to the form (sign-up CTA included) for
    // the whole /signing-in load, so the spinner has to survive the handoff.
    let navigated = false;
    try {
      await loginWithSupabaseEmail(email, password);
      navigated = true;
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
      if (!navigated) setBusy("");
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
    let navigated = false;
    try {
      const ok = await completePasswordRecovery(password);
      if (ok) {
        navigated = true;
        // Full reload so the fresh session cookie is read server-side.
        window.location.assign("/signing-in");
      } else {
        setError(t("recoveryInvalid"));
      }
    } catch (err) {
      setError(err.message || t("recoveryInvalid"));
    } finally {
      if (!navigated) setBusy("");
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
            <BrandMark />
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
            <BrandMark />
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

  if (
    resolvingWall ||
    busy === "email" ||
    busy === "google" ||
    busy === "facebook" ||
    busy === "linkedin" ||
    busy === "twitch" ||
    waitingOnOAuth
  ) {
    return (
      <main className={styles.signingInScreen}>
        {/* Logo deliberately omitted here: this screen replaces the whole page
            during a wait the member did not start (auth wall, OAuth return), so
            a brand mark reads as a fresh page load rather than progress. */}
        <div className={styles.signingIn} role="status" aria-live="polite">
          <div className={styles.spinner} />
          <p className={styles.loadText}>
            {resolvingWall || busy === "email" ? t("signingIn") : t("preparingSignIn")}
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
          <h1 className={styles.title}>{t("welcomeBack")}</h1>
          <p className={styles.subtitle}>{t("signInToJoin")}</p>

          {error && <p className={styles.error}>{error}</p>}

          {noAccount && (
            <div className={styles.verifyBox}>
              <p className={styles.verifyText}>
                There&apos;s no Secret Yarnery account linked to this account yet.
                Create one to join the community.
              </p>
              <a
                className={styles.linkBtn}
                href="/signup"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.assign("/signup");
                }}
              >
                Create an account
              </a>
            </div>
          )}

          <button
            className={styles.oauthButton}
            onClick={handleGoogle}
            disabled={!!busy}
            type="button"
          >
            <GoogleIcon /> {t("continueWithGoogle")}
          </button>

          <button
            className={styles.oauthButton}
            onClick={handleFacebook}
            disabled={!!busy}
            type="button"
          >
            <FacebookIcon /> {t("continueWithFacebook")}
          </button>

          <button
            className={styles.oauthButton}
            onClick={handleLinkedIn}
            disabled={!!busy}
            type="button"
          >
            <LinkedInIcon /> {t("continueWithLinkedIn")}
          </button>

          <button
            className={styles.oauthButton}
            onClick={handleTwitch}
            disabled={!!busy}
            type="button"
          >
            <TwitchIcon /> {t("continueWithTwitch")}
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
