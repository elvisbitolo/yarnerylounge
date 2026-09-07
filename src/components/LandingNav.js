"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import styles from "./LandingNav.module.css";

const LINKS = [{ href: "/explore", key: "exploreCommunity" }];

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

function getCurrentLocale() {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(/NEXT_LOCALE=(\w+)/);
  return match ? match[1] : "en";
}

function switchLang(code) {
  document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000`;
  window.location.reload();
}

function LangPicker({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [locale, setLocale] = useState("en");

  // Read the NEXT_LOCALE cookie into state once on mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time cookie read, avoids SSR/hydration mismatch
  useEffect(() => setLocale(getCurrentLocale()), []);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const current = LANGUAGES.find((l) => l.code === locale) || LANGUAGES[0];

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "1px solid rgba(23, 23, 51, 0.16)",
          borderRadius: 8,
          padding: "6px 10px",
          color: "#6f6155",
          fontSize: 13,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>{current.flag}</span>
        <span>{current.label}</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "#ffffff",
            border: "1px solid #eadfd2",
            borderRadius: 10,
            padding: 6,
            minWidth: 150,
            boxShadow: "0 14px 40px -12px rgba(9, 12, 38, 0.25)",
            zIndex: 1000,
          }}
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                switchLang(lang.code);
                if (onNavigate) onNavigate();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 12px",
                border: "none",
                background: locale === lang.code ? "rgba(244, 46, 121, 0.12)" : "transparent",
                color: locale === lang.code ? "#d81f66" : "#171a33",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: locale === lang.code ? 600 : 400,
              }}
            >
              <span style={{ fontSize: 16 }}>{lang.flag}</span>
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LandingNav() {
  const t = useTranslations("landing");
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Main">
        <div className={styles.inner}>
          <Link href="/" className={styles.brand} onClick={() => setOpen(false)}>
            <Image
              src="/brand/secretyarnery-logo.webp"
              alt="Secret Yarnery"
              width={90}
              height={28}
              className={styles.brandLogo}
              priority
            />
            <span className={styles.brandWord}>Secret Yarnery</span>
          </Link>

          <div className={styles.desktopLinks}>
            {LINKS.map((link) => (
              <Link key={link.href} className={styles.link} href={link.href}>
                {t(link.key)}
              </Link>
            ))}
            <span className={styles.divider} aria-hidden="true" />
            <Link className={styles.link} href="/login">
              {t("login")}
            </Link>
            <Link className={styles.cta} href="/signup">
              {t("signup")}
            </Link>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LangPicker />
            <button
              type="button"
              className={open ? `${styles.burger} ${styles.burgerOpen}` : styles.burger}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="landing-menu"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              <span className={styles.burgerLine} />
              <span className={styles.burgerLine} />
              <span className={styles.burgerLine} />
            </button>
          </div>
        </div>

        {open && (
          <div id="landing-menu" className={styles.mobileMenu}>
            {LINKS.map((link) => (
              <Link
                key={link.href}
                className={styles.mobileLink}
                href={link.href}
                onClick={() => setOpen(false)}
              >
                {t(link.key)}
              </Link>
            ))}
            <Link className={styles.mobileLink} href="/login" onClick={() => setOpen(false)}>
              {t("login")}
            </Link>
            <Link className={styles.mobileCta} href="/signup" onClick={() => setOpen(false)}>
              {t("signup")}
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
