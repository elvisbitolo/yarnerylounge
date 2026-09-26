"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import styles from "../auth.module.css";

const LANDING_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

// A session the server keeps refusing (suspended/deleted account, a cookie the
// auth wall can't heal) sends /signing-in -> /dashboard -> /login -> /signing-in
// round again, reloading the tab forever. Count the round trips in this tab and
// stop bouncing once it is clearly not converging; a member signing in normally
// never gets near the limit.
const VISIT_KEY = "sy:signing-in:visits";
const VISIT_WINDOW_MS = 30_000;
const MAX_VISITS = 3;

function countRecentVisits() {
  try {
    const now = Date.now();
    const stamps = JSON.parse(window.sessionStorage.getItem(VISIT_KEY) || "[]")
      .filter((t) => typeof t === "number" && now - t < VISIT_WINDOW_MS);
    stamps.push(now);
    window.sessionStorage.setItem(VISIT_KEY, JSON.stringify(stamps));
    return stamps.length;
  } catch {
    return 1;
  }
}

function clearVisits() {
  try {
    window.sessionStorage.removeItem(VISIT_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}

export default function SigningInPage() {
  const [failed, setFailed] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    // The copy promises the member is being returned to the form, so actually
    // do it — after a beat to read the message, with the manual button still
    // there for anyone who would rather not wait. This is a normal outcome (no
    // usable session), not a loop, so it must not spend the visit budget.
    function giveUp() {
      clearVisits();
      setFailed(true);
      timeoutId = setTimeout(() => {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the auth wall re-checks from a clean slate
        window.location.assign("/login");
      }, 2500);
    }

    (async () => {
      try {
        if (countRecentVisits() > MAX_VISITS) {
          // Not converging, so stop navigating on the member's behalf — bouncing
          // to /login only feeds the auth wall straight back into this page.
          // Clear the budget so a deliberate retry starts fresh and leave the
          // next move to them.
          clearVisits();
          if (!cancelled) setStuck(true);
          return;
        }
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
          giveUp();
        }
      } catch {
        if (!cancelled) giveUp();
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <main className={styles.signingInScreen}>
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
          {stuck
            ? "We couldn't complete your sign-in — please try again."
            : failed
              ? "Couldn't sign you in — returning to the form…"
              : "Signing you in…"}
        </p>
        {(failed || stuck) && (
          <a
            className={styles.linkBtn}
            href="/login"
            onClick={(e) => {
              e.preventDefault();
              clearVisits();
              window.location.assign("/login");
            }}
          >
            Back to sign in
          </a>
        )}
      </div>
    </main>
  );
}