"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import styles from "./Nav.module.css";
import MemberBadge from "./MemberBadge";
import { Flame, LogOut } from "lucide-react";
import { logout } from "@/lib/client-auth";

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Avatar({ url, name, className }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={url} alt="" />;
  }
  return <span className={className}>{initials(name)}</span>;
}

export default function SidebarProfile({ points = 0, streak = 0, close }) {
  const t = useTranslations("nav");
  const router = useRouter();
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

  const name = profile?.name || "Member";
  const handle = profile?.username ? `@${profile.username}` : profile?.email || "";
  const xp = Number(points) || 0;

  async function handleLogout() {
    close?.();
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className={styles.sidebarFooter}>
      <Link className={styles.profileCard} href="/account" onClick={close}>
        <Avatar url={profile?.photoURL} name={name} className={styles.profileCardAvatar} />
        <div className={styles.profileCardBody}>
          <p className={styles.profileCardName}>
            {name}
            <MemberBadge role={profile?.role} size={13} />
          </p>
          <p className={styles.profileCardHandle}>{handle}</p>
          <p className={styles.profileCardMeta}>
            {xp.toLocaleString()} XP · <Flame size={13} /> {streak || 0}
          </p>
        </div>
      </Link>

      <Link className={styles.profileViewBtn} href="/account" onClick={close}>
        {t("viewProfile")}
      </Link>
      <button type="button" className={styles.sidebarSignOut} onClick={handleLogout}>
        <LogOut size={21} strokeWidth={2.4} aria-hidden="true" />
        <span>Sign out</span>
      </button>
    </div>
  );
}