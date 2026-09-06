"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/lib/client-auth";
import styles from "./plan-expired.module.css";

const UPGRADE_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

export default function ExpiredPanel() {
  const router = useRouter();

  async function handleSignOut() {
    await logout();
    router.push("/login");
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
      <button type="button" className={styles.ghostBtn} onClick={handleSignOut}>
        Sign out and browse as Guest
      </button>
    </>
  );
}