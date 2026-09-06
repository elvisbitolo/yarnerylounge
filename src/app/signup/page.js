"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { signupWithEmail, signupWithGoogle } from "@/lib/client-auth";
import GoogleIcon from "@/components/GoogleIcon";
import PasswordInput from "@/components/PasswordInput";
import AuthAside from "@/components/AuthAside";
import styles from "../auth.module.css";

const LANDING_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

export default function SignupPage() {
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

  useEffect(() => {
    const timer = setTimeout(() => {
      const prefill = new URLSearchParams(window.location.search).get("email");
      if (prefill) setEmail(prefill);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function handleGoogle() {
    setError("");
    setBusy("google");
    let navigated = false;
    try {
      await signupWithGoogle();
      navigated = true;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the fresh session cookie is sent
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err.message || t("googleFailed"));
    } finally {
      if (!navigated) setBusy("");
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
    try {
      await signupWithEmail(name, email, password);
      setVerifyEmail(email);
      setResent(false);
    } catch (err) {
      if (err.code === "email_not_verified") {
        if (auth.currentUser) {
          await sendEmailVerification(auth.currentUser).catch(() => {});
        }
        setVerifyEmail(email);
        setResent(false);
      } else {
        setError(err.message || "Sign-up failed");
      }
    } finally {
      setBusy("");
    }
  }

  async function resendVerification() {
    if (!auth.currentUser) return;
    setBusy("verify");
    setError("");
    try {
      await sendEmailVerification(auth.currentUser);
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
