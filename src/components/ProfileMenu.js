"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { roleBadgeLabel } from "@/lib/profile/roles";
import { logout } from "@/lib/client-auth";
import styles from "./Nav.module.css";

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ProfileMenu() {
  const router = useRouter();
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) setProfile(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const name = profile?.name || "Account";
  const isStaff = profile?.role === "owner" || profile?.role === "moderator";

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.profileWrap} ref={menuRef}>
      <button
        type="button"
        className={styles.profileBtn}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profile menu"
      >
        {profile?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.profileAvatar} src={profile.photoURL} alt="" />
        ) : (
          <span className={styles.profileAvatar}>{initials(name)}</span>
        )}
        <span className={styles.profileName}>{name}</span>
        <svg
          className={open ? `${styles.profileCaret} ${styles.profileCaretUp}` : styles.profileCaret}
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className={styles.profileMenu} role="menu">
          <div className={styles.profileHeader}>
            {profile?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.profileMenuAvatar} src={profile.photoURL} alt="" />
            ) : (
              <span className={styles.profileMenuAvatar}>{initials(name)}</span>
            )}
            <div style={{ minWidth: 0 }}>
              <p className={styles.profileNameMenu}>{name}</p>
              <p className={styles.profileEmail}>
                {profile?.username ? `@${profile.username}` : profile?.email || ""}
                {isStaff ? (
                  <span className={styles.roleBadge}>{roleBadgeLabel(profile.role, profile.roleLabel)}</span>
                ) : null}
              </p>
            </div>
          </div>

          <Link className={styles.profileLink} href="/account" onClick={() => setOpen(false)}>
            Account
          </Link>
          <Link className={styles.profileLink} href="/invite" onClick={() => setOpen(false)}>
            Invite a friend
          </Link>
          <Link className={styles.profileLink} href="/notifications" onClick={() => setOpen(false)}>
            Notifications
          </Link>
          {isStaff && (
            <Link className={styles.profileLink} href="/admin" onClick={() => setOpen(false)}>
              Admin
            </Link>
          )}
          {isStaff && (
            <Link className={styles.profileLink} href="/admin/settings" onClick={() => setOpen(false)}>
              Settings
            </Link>
          )}
          <div className={styles.profileMenuDivider} />
          <button
            type="button"
            className={styles.profileLink}
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
