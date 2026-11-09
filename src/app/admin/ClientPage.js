"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import styles from "./rooms/admin.module.css";

function formatRelativeTime(timestamp) {
  if (!timestamp) return "Date unavailable";

  const seconds = Math.round((timestamp - Date.now()) / 1000);
  if (Math.abs(seconds) < 45) return "just now";

  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const [unit, unitSeconds] = units.find(([, size]) => Math.abs(seconds) >= size) || units[units.length - 1];
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round(seconds / unitSeconds),
    unit
  );
}

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
        { label: "Live lounges", value: data.counts.rooms, href: "/admin/rooms" },
        { label: "Events", value: data.counts.events, href: "/admin/events" },
        { label: "Courses", value: data.counts.courses, href: "/admin/courses" },
        { label: "RSVPs", value: data.counts.rsvps, href: "/admin/events" },
        { label: "Reports", value: data.counts.reports, href: "/admin/moderation" },
        { label: "Notifications sent", value: data.counts.notifications, href: null },
      ]
    : [];

  const isOwner = role === "owner";
  const forbidden = error === "Forbidden";

  return (
      <div className={`${styles.container} ${styles.overviewContainer}`}>
        <h1 className={styles.title}>Admin overview</h1>
        {forbidden ? (
          <div className={styles.form}>
            <p className={styles.formTitle}>Owner access required</p>
            <p className={styles.field}>
              The overview dashboard reads revenue-shaped totals, so it is owner-only. As a moderator you
              can still work from <a href="/admin/members">Members</a>,{" "}
              <a href="/admin/moderation">Moderation</a>,{" "}
              <a href="/admin/announcements">Announcements</a> and <a href="/admin/hosts">Hosts</a>.
            </p>
          </div>
        ) : null}
        <p className={styles.linkRow}>
          <Link className={styles.link} href="/admin/content">Browse all content →</Link>
          {isOwner ? <Link className={styles.link} href="/admin/analytics">View analytics →</Link> : null}
        </p>
        <div className={styles.quickActions}>
          <Link className={styles.quickAction} href="/feed">Create post</Link>
          <Link className={styles.quickAction} href="/admin/rooms">Create lounge</Link>
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
                {data.recentPosts.map((post) => {
                  const initials = (post.authorName || "M")
                    .trim()
                    .split(/\\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase();
                  return (
                    <article key={post.id} className={`${styles.item} ${styles.recentPostItem}`}>
                      <div className={styles.recentPostAvatar}>
                        {post.photoURL ? (
                          <img src={post.photoURL} alt={`${post.authorName}'s profile`} />
                        ) : (
                          <span>{initials || "M"}</span>
                        )}
                      </div>
                      <div className={styles.recentPostContent}>
                        <div className={styles.recentPostHeader}>
                          <div className={styles.recentPostAuthor}>
                            <p className={styles.itemName}>{post.authorName}</p>
                            {post.username ? <span className={styles.recentPostUsername}>@{post.username}</span> : null}
                          </div>
                          <time
                            className={styles.recentPostTime}
                            dateTime={post.createdAt ? new Date(post.createdAt).toISOString() : undefined}
                            title={post.createdAt ? new Date(post.createdAt).toLocaleString() : "Date unavailable"}
                          >
                            {formatRelativeTime(post.createdAt)}
                          </time>
                        </div>
                        <p className={styles.recentPostText}>{post.text || "(No text content)"}</p>
                        <div className={styles.recentPostFooter}>
                          <span>{post.kind === "question" ? "Question" : post.kind === "poll" ? "Poll" : post.kind === "win" ? "Community win" : "Post"}</span>
                          {post.hasImage ? <span>Photo</span> : null}
                          {post.hasVideo ? <span>Video</span> : null}
                          {post.edited ? <span>Edited</span> : null}
                          <span>{post.commentCount} comments</span>
                          <span>{post.likeCount} likes</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
  );
}
