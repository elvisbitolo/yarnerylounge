"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import styles from "../auth.module.css";

const LANDING_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

export default function SigningInPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId;
    (async () => {
      try {
        const { reconcileSessionCookie, refreshSession } = await import("@/lib/client-auth");
        const params = new URLSearchParams(window.location.search);
        let ready = false;
        if (params.has("session_refresh")) {
          ready = await refreshSession();
        } else if (params.has("provider")) {
          ready = await (await import("@/lib/client-auth")).completeSupabaseGoogle();
        } else {
          ready = await reconcileSessionCookie();
        }
        if (cancelled) return;
        if (ready) {
          // Full reload so server-rendered pages read the fresh session cookie.
          // Give the branded screen at least a moment so the swap feels smooth.
          timeoutId = setTimeout(() => {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload reads the httpOnly session cookie
            window.location.assign("/dashboard");
          }, 900);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.authContainer}>
        <div className={styles.authForm}>
          <p className={styles.brand}>
            <a className={styles.brandLink} href={LANDING_URL}>
              <Image
                src="/brand/secretyarnery-logo.webp"
                alt=""
                width={90}
                height={28}
                className={styles.brandLogo}
              />
              <span className={styles.brandWord}>Secret Yarnery</span>
            </a>
          </p>
          <div className={styles.signingIn} role="status" aria-live="polite">
            <div className={styles.spinner} />
            <p className={styles.loadText}>
              {failed ? "Couldn't sign you in — returning to the form…" : "Signing you in…"}
            </p>
            {failed && (
              <a
                className={styles.linkBtn}
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.assign("/login");
                }}
              >
                Back to sign in
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}