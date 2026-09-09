"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "./rooms/admin.module.css";

export default function AdminOverviewPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      fetch("/api/admin/overview")
        .then(async (res) => {
          if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
          return res.json();
        })
        .then(setData)
        .catch((err) => setError(err.message));
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  const statCards = data
    ? [
        { label: "Members", value: data.counts.users, href: "/admin/members" },
        { label: "Posts", value: data.counts.posts, href: "/admin/spaces" },
        { label: "Spaces", value: data.counts.spaces, href: "/admin/spaces" },
        { label: "Groups", value: data.counts.groups, href: "/admin/groups" },
        { label: "Live rooms", value: data.counts.rooms, href: "/admin/rooms" },
        { label: "Events", value: data.counts.events, href: "/admin/events" },
        { label: "Courses", value: data.counts.courses, href: "/admin/courses" },
        { label: "RSVPs", value: data.counts.rsvps, href: "/admin/events" },
        { label: "Reports", value: data.counts.reports, href: "/admin/moderation" },
        { label: "Notifications sent", value: data.counts.notifications, href: null },
      ]
    : [];

  return (
      <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Admin overview</h1>
        <p className={styles.linkRow}>
          <Link className={styles.link} href="/admin/analytics">View analytics →</Link>
        </p>
        <div className={styles.quickActions}>
          <Link className={styles.quickAction} href="/feed">Create post</Link>
          <Link className={styles.quickAction} href="/admin/rooms">Create room</Link>
          <Link className={styles.quickAction} href="/admin/events">Schedule event</Link>
          <Link className={styles.quickAction} href="/admin/courses">Create course</Link>
          <Link className={styles.quickAction} href="/admin/groups">Create group/space</Link>
          <Link className={styles.quickAction} href="/admin/announcements">Send announcement</Link>
          <Link className={styles.quickAction} href="/admin/members">Manage members</Link>
          <Link className={styles.quickAction} href="/admin/analytics">View analytics</Link>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        {!data ? (
          <p className={styles.empty}>Loading…</p>
        ) : (
          <>
            <div className={styles.statGrid}>
              {statCards.map((card) =>
                card.href ? (
                  <Link key={card.label} href={card.href} className={styles.statCard}>
                    <p className={styles.statValue}>{card.value}</p>
                    <p className={styles.statLabel}>{card.label}</p>
                  </Link>
                ) : (
                  <div key={card.label} className={styles.statCard}>
                    <p className={styles.statValue}>{card.value}</p>
                    <p className={styles.statLabel}>{card.label}</p>
                  </div>
                )
              )}
            </div>

            <h2 className={styles.listTitle}>Top members this week</h2>
            {data.leaderboard.length === 0 ? (
              <p className={styles.empty}>No points yet.</p>
            ) : (
              <div className={styles.list}>
                {data.leaderboard.map((entry) => (
                  <div key={entry.userId} className={styles.item}>
                    <div>
                      <p className={styles.itemName}>
                        #{entry.rank} {entry.name}
                      </p>
                      <p className={styles.itemMeta}>
                        {entry.points} pts · {entry.streak} day streak · {entry.badgeCount} badges
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 className={styles.listTitle}>Recent posts</h2>
            {data.recentPosts.length === 0 ? (
              <p className={styles.empty}>No posts yet.</p>
            ) : (
              <div className={styles.list}>
                {data.recentPosts.map((post) => (
                  <div key={post.id} className={styles.item}>
                    <div>
                      <p className={styles.itemName}>{post.text || "(no text)"}</p>
                      <p className={styles.itemMeta}>
                        by {post.authorName} ·{" "}
                        {new Date(post.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
</Nav>
  );
}
