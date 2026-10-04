"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionsForRole } from "@/lib/admin/nav";
import styles from "@/lib/admin/admin.module.css";

export default function AdminRail({ role, name, email }) {
  const pathname = usePathname();
  const sections = sectionsForRole(role);

  const isActive = (href) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className={styles.rail} aria-label="Admin sections">
      <div className={styles.brand}>
        Admin <span className={styles.brandAccent}>console</span>
      </div>

      <div className={styles.who}>
        <p className={styles.whoName}>{name || email || "Signed in"}</p>
        <p className={styles.whoRole}>
          {role} · {role === "owner" ? "full access" : "limited"}
        </p>
      </div>

      {sections.map((section) => (
        <div key={section.label}>
          <div className={styles.group}>{section.label}</div>
          {section.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.link} ${isActive(item.href) ? styles.linkActive : ""}`}
            >
              <span className={styles.dot} />
              {item.label}
              {item.isNew ? <span className={styles.newTag}>NEW</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
