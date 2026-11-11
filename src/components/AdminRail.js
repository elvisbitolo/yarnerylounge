"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionsForRole } from "@/lib/admin/nav";
import styles from "@/lib/admin/admin.module.css";

export default function AdminRail({ role, name, email }) {
  const pathname = usePathname();
  const sections = sectionsForRole(role);
  const [openPath, setOpenPath] = useState(null);
  const menuOpen = openPath === pathname;
  const railRef = useRef(null);
  const railTopRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpenPath(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    const rail = railRef.current;
    const active = activeRef.current;
    if (!rail || !active) return;
    const frame = requestAnimationFrame(() => {
      const railRect = rail.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const topOffset = railTopRef.current?.offsetHeight ?? 0;
      if (!activeRect.height) return;
      if (activeRect.top < railRect.top + topOffset + 8) {
        rail.scrollTop += activeRect.top - railRect.top - topOffset - 8;
      } else if (activeRect.bottom > railRect.bottom - 8) {
        rail.scrollTop += activeRect.bottom - railRect.bottom + 8;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, menuOpen]);

  const isActive = (href) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      ref={railRef}
      className={`${styles.rail} ${menuOpen ? styles.railOpen : ""}`}
      aria-label="Admin sections"
    >
      <div ref={railTopRef} className={styles.railTop}>
        <div className={styles.brand}>
          Admin <span className={styles.brandAccent}>console</span>
        </div>
        <button
          type="button"
          className={styles.navToggle}
          aria-expanded={menuOpen}
          aria-controls="admin-nav"
          aria-label={menuOpen ? "Close admin navigation" : "Open admin navigation"}
          onClick={() => setOpenPath(menuOpen ? null : pathname)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      <div className={styles.who}>
        <p className={styles.whoName}>{name || email || "Signed in"}</p>
        <p className={styles.whoRole}>
          {role} · {role === "owner" ? "full access" : "limited access"}
        </p>
      </div>

      <div id="admin-nav" className={styles.railScroll}>
        {sections.map((section) => (
          <div key={section.label}>
            <div className={styles.group}>{section.label}</div>
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  ref={active ? activeRef : undefined}
                  className={`${styles.link} ${active ? styles.linkActive : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpenPath(null)}
                >
                  <span className={styles.dot} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.isNew ? <span className={styles.newTag}>NEW</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
