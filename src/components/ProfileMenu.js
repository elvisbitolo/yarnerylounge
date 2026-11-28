"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { roleBadgeLabel } from "@/lib/profile/roles";
import { logout, logoutAll } from "@/lib/client-auth";
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
  const [accounts, setAccounts] = useState([]);
  const [canSwitch, setCanSwitch] = useState(false);
  const [switching, setSwitching] = useState("");
  const [switchError, setSwitchError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) setProfile(data);
      })
      .catch(() => {});
    fetch("/api/auth/accounts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setCanSwitch(Boolean(data.eligible));
        setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onStorage(e) {
      if (e.key === "community:auth-switch") window.location.reload();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Refresh the saved-account list every time the menu opens, so an account
  // just created in the admin form appears without a full page reload.
  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/auth/accounts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setCanSwitch(Boolean(data.eligible));
        setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open]);

  const name = profile?.name || "Account";
  const isStaff = profile?.role === "owner" || profile?.role === "moderator";

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  async function handleLogoutAll() {
    await logoutAll();
    // Full reload so every client subscription is reset with the cleared cookie.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload after the session cookie is cleared
    window.location.assign("/login");
  }

  async function handleSwitch(userId) {
    if (switching) return;
    setSwitchError("");
    setSwitching(userId);
    try {
      const res = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not switch accounts");
      try {
        localStorage.setItem("community:auth-switch", String(data.uid || ""));
      } catch {}
      // Full reload rebinds every server and client view to the new identity.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload after the active session cookie changes
      window.location.assign("/dashboard");
    } catch (err) {
      setSwitchError(err.message || "Could not switch accounts");
      setSwitching("");
    }
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

          {canSwitch && (
            <div className={styles.accountSection}>
              <p className={styles.accountLabel}>Switch account</p>
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className={styles.accountRow}
                  onClick={() => handleSwitch(account.id)}
                  disabled={account.current || Boolean(switching)}
                  aria-current={account.current ? "true" : undefined}
                >
                  {account.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.accountAvatar} src={account.photoURL} alt="" />
                  ) : (
                    <span className={styles.accountAvatar}>
                      {initials(account.name || account.email)}
                    </span>
                  )}
                  <span className={styles.accountMeta}>
                    <span className={styles.accountName}>{account.name || "Account"}</span>
                    <span className={styles.accountEmail}>{account.email || ""}</span>
                  </span>
                  {account.current ? (
                    <span className={styles.accountCurrent}>Current</span>
                  ) : switching === account.id ? (
                    <span className={styles.accountCurrent}>...</span>
                  ) : null}
                </button>
              ))}
              {switchError && <p className={styles.accountError}>{switchError}</p>}
              <a
                className={styles.profileLink}
                href="/login?addAccount=1"
                onClick={() => setOpen(false)}
              >
                + Add account
              </a>
            </div>
          )}

          <Link className={styles.profileLink} href="/account" onClick={() => setOpen(false)}>
            Account
          </Link>
          <Link className={styles.profileLink} href="/invite" onClick={() => setOpen(false)}>
            Invite a friend
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
          {canSwitch && accounts.length > 1 && (
            <button
              type="button"
              className={styles.profileLink}
              onClick={handleLogoutAll}
            >
              Sign out of all accounts
            </button>
          )}
        </div>
      )}
    </div>
  );
}
