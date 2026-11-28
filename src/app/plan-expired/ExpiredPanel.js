"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/client-auth";
import styles from "./plan-expired.module.css";

const UPGRADE_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

const PAID_TIERS = new Set(["hooking-up", "moving-in"]);

export default function ExpiredPanel() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");

  async function handleCheckAccess() {
    if (checking) return;
    setChecking(true);
    setMessage("");
    try {
      const response = await fetch("/api/membership/me", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Membership status could not be checked.");
      const data = await response.json();
      const planKey = data?.membership?.planKey;
      if (data?.ok && PAID_TIERS.has(planKey)) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      setMessage(
        "We have not received confirmation of an active paid membership yet. If you just completed checkout, wait briefly for Shopify to confirm the payment, then check again."
      );
    } catch {
      setMessage("We could not verify your membership right now. Please try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  async function handleSignOut() {
    await logout();
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <a
        href={UPGRADE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.renewBtn}
      >
        Renew Access on Shopify
      </a>
      <button
        type="button"
        className={styles.checkBtn}
        onClick={handleCheckAccess}
        disabled={checking}
      >
        {checking ? "Checking membership…" : "I’ve renewed — check access"}
      </button>
      {message ? <p className={styles.statusMessage} role="status">{message}</p> : null}
      <a className={styles.accountLink} href="/account/membership">
        View membership details
      </a>
      <button type="button" className={styles.ghostBtn} onClick={handleSignOut}>
        Sign out and browse as Guest
      </button>
    </>
  );
}
