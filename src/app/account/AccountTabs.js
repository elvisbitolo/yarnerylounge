"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./account.module.css";

const TABS = [
  { href: "/account", label: "Overview" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/hobbies", label: "Hobbies" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/membership", label: "Membership" },
  { href: "/account/settings", label: "Settings" },
];

export default function AccountTabs() {
  const pathname = usePathname();
  const active = TABS.find(
    (t) => (t.href === "/account" ? pathname === t.href : pathname.startsWith(t.href))
  )?.href || "/account";

  return (
    <nav className={styles.tabs} aria-label="Account sections">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={active === t.href ? `${styles.tab} ${styles.tabActive}` : styles.tab}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}