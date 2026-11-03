"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";

function useDashboardResource(url, key) {
  const [value, setValue] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch(url, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Request failed");
        return response.json();
      })
      .then((data) => { if (active) setValue(data?.[key] ?? data); })
      .catch(() => { if (active) setValue(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url, key]);
  return { value, loading };
}

function DashboardCard({ title, href, linkLabel, children }) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {href ? <Link className={styles.cardLink} href={href}>{linkLabel || "View all"} →</Link> : null}
      </div>
      {children}
    </section>
  );
}

function relativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function DashboardCommunityFeed() {
  const { value, loading } = useDashboardResource("/api/posts?limit=5", "posts");
  const posts = Array.isArray(value) ? value.slice(0, 5) : [];
  return (
    <DashboardCard title="Latest from your community" href="/feed" linkLabel="Open feed">
      {loading ? <p className={styles.itemBody}>Loading recent posts…</p> : posts.length ? (
        <ul className={styles.list}>
          {posts.map((post) => (
            <li key={post.id}>
              <Link className={styles.item} href="/feed">
                <span className={styles.itemSplit}>
                  <span className={styles.itemTitle}>{post.authorName || "Community member"}</span>
                  <span className={styles.itemMeta}>{relativeTime(post.createdAt)}</span>
                </span>
                {post.title ? <strong className={styles.itemTitle}>{post.title}</strong> : null}
                <span className={styles.itemBody}>{(post.text || post.excerpt || "Shared a community update").slice(0, 180)}</span>
                <span className={styles.itemMeta}>{Object.keys(post.likes || {}).length} likes · {post.commentCount || 0} comments</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className={styles.itemBody}>No recent posts to show yet. Be the first to start a conversation.</p>}
    </DashboardCard>
  );
}

export function DashboardActivityPreview() {
  const { value, loading } = useDashboardResource("/api/notifications?preview=1", "notifications");
  const notifications = Array.isArray(value) ? value.slice(0, 5) : [];
  return (
    <DashboardCard title="Your recent activity" href="/notifications" linkLabel="All activity">
      {loading ? <p className={styles.itemBody}>Checking your activity…</p> : notifications.length ? (
        <ul className={styles.list}>
          {notifications.map((item) => {
            const href = typeof item.href === "string" && item.href.startsWith("/") ? item.href : "/notifications";
            return <li key={item.id}>
              <Link className={styles.item} href={href}>
                <span className={styles.itemSplit}>
                  <span className={styles.itemTitle}>{item.actorName || "Yarnery Lounge"}</span>
                  <span className={styles.itemMeta}>{relativeTime(item.createdAt)}</span>
                </span>
                <span className={styles.itemBody}>{item.text || "You have a new community notification."}</span>
                {!item.read ? <span className={styles.activityUnread}>New</span> : null}
              </Link>
            </li>;
          })}
        </ul>
      ) : <p className={styles.itemBody}>You're all caught up. New likes, replies and mentions will appear here.</p>}
    </DashboardCard>
  );
}

export function DashboardMemberDiscovery() {
  const { value, loading } = useDashboardResource("/api/members/similar", "members");
  const members = Array.isArray(value) ? value.slice(0, 4) : [];
  return (
    <DashboardCard title="People you may want to meet" href="/members" linkLabel="Discover members">
      {loading ? <p className={styles.itemBody}>Finding people with shared interests…</p> : members.length ? (
        <div className={styles.memberSuggestions}>
          {members.map((member) => (
            <Link className={styles.memberSuggestion} href={`/members/${encodeURIComponent(member.id)}`} key={member.id}>
              {member.photoURL ? <img src={member.photoURL} alt="" /> : <span className={styles.memberAvatar}>{(member.name || "M").slice(0, 1).toUpperCase()}</span>}
              <span className={styles.memberSuggestionText}>
                <strong>{member.name}</strong>
                <span>{member.headline || member.country || "Yarnery member"}</span>
                {member.score ? <small>{member.score}% profile match</small> : null}
              </span>
            </Link>
          ))}
        </div>
      ) : <p className={styles.itemBody}>Complete your profile and interests to help us find good connections.</p>}
    </DashboardCard>
  );
}

export function DashboardMembershipCard() {
  const { value, loading } = useDashboardResource("/api/membership/me", "membership");
  const membership = value && typeof value === "object" ? value : null;
  return (
    <DashboardCard title="Your membership" href="/membership" linkLabel="View benefits">
      {loading ? <p className={styles.itemBody}>Loading membership…</p> : membership ? (
        <>
          <div className={styles.membershipSummary}>
            <span className={styles.membershipBadge}>{membership.label || membership.planKey || "Flirting"}</span>
            <span className={styles.itemMeta}>Current plan</span>
          </div>
          {membership.expiresAt ? (
            <p className={styles.itemBody}>
              {membership.daysRemaining === 0
                ? "Your membership has reached its expiry date."
                : "Expires on " + new Date(membership.expiresAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) + " · " + membership.daysRemaining + " day(s) remaining."}
            </p>
          ) : (
            <p className={styles.itemBody}>Your current membership benefits and plan options are available here.</p>
          )}
          <Link className={styles.spotCta} href="/membership">Manage membership</Link>
        </>
      ) : <p className={styles.itemBody}>Membership details are temporarily unavailable.</p>}
    </DashboardCard>
  );
}
