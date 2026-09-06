"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import Nav from "@/components/Nav";
import { cardThemeVars } from "@/lib/card-themes";
import styles from "./analytics.module.css";

function formatMoney(cents) {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

const STAT_THEMES = ["indigo", "sky", "emerald", "amber", "violet", "rose", "teal", "fuchsia", "slate"];

export default function AdminAnalyticsPage() {
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
      fetch("/api/admin/analytics")
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

  const sub = data?.revenue?.subscriptions;
  const purchases = data?.revenue?.purchases;
  const statCards = data
    ? [
        { label: "Members", value: data.members.total, href: "/admin/members" },
        { label: "Active (7d)", value: data.members.active7, href: "/admin/members" },
        { label: "Contributing", value: data.members.contributing, href: null },
        { label: "Signups (30d)", value: data.members.signups.last30, href: null },
        { label: "Posts", value: data.engagement.posts, href: "/admin/spaces" },
        { label: "Comments", value: data.engagement.comments, href: null },
        { label: "RSVPs", value: data.engagement.rsvps, href: "/admin/events" },
        { label: "Courses", value: data.courses.total, href: "/admin/courses" },
        { label: "Learners", value: data.courses.learners, href: null },
        { label: "Completions", value: data.courses.completions, href: null },
        { label: "Active subs", value: sub ? sub.active : "—", href: null },
        { label: "MRR", value: sub ? formatMoney(sub.estimatedMonthlyCents) : "—", href: null },
      ]
    : [];

  const tierLabels = { flirting: "Flirting", "hooking-up": "Hooking Up", "moving-in": "Moving In", lounge: "Flirting", plus: "Hooking Up", host: "Moving In" };
  const planLabels = { monthly: "Monthly", yearly: "Yearly" };

  return (
      <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Admin analytics</h1>
        {error && <p className={styles.error}>{error}</p>}
        {!data ? (
          <p className={styles.empty}>Loading…</p>
        ) : (
          <>
            <div className={styles.statGrid}>
              {statCards.map((card, i) =>
                card.href ? (
                  <Link
                    key={card.label}
                    href={card.href}
                    className={styles.statCard}
                    style={cardThemeVars(STAT_THEMES[i % STAT_THEMES.length], { light: true })}
                  >
                    <p className={styles.statValue}>{card.value}</p>
                    <p className={styles.statLabel}>{card.label}</p>
                  </Link>
                ) : (
                  <div
                    key={card.label}
                    className={styles.statCard}
                    style={cardThemeVars(STAT_THEMES[i % STAT_THEMES.length], { light: true })}
                  >
                    <p className={styles.statValue}>{card.value}</p>
                    <p className={styles.statLabel}>{card.label}</p>
                  </div>
                )
              )}
            </div>

            <h2 className={styles.listTitle}>Growth</h2>
            <div className={styles.grid}>
              <div className={styles.card} style={cardThemeVars("indigo", { light: true })}>
                <h3 className={styles.cardTitle}>Signups</h3>
                <p className={styles.cardStat}>Total {data.members.signups.total}</p>
                <p className={styles.cardStat}>Last 7 days {data.members.signups.last7}</p>
                <p className={styles.cardStat}>Last 30 days {data.members.signups.last30}</p>
              </div>
              <div className={styles.card} style={cardThemeVars("emerald", { light: true })}>
                <h3 className={styles.cardTitle}>Activity</h3>
                <p className={styles.cardStat}>Active members (7d) {data.members.active7}</p>
                <p className={styles.cardStat}>Contributing members {data.members.contributing}</p>
                <p className={styles.cardStat}>Posts (7d) {data.engagement.posts7}</p>
                <p className={styles.cardStat}>Members who RSVP&apos;d {data.engagement.rsvpMembers}</p>
              </div>
              <div className={styles.card} style={cardThemeVars("sky", { light: true })}>
                <h3 className={styles.cardTitle}>Courses</h3>
                <p className={styles.cardStat}>Courses {data.courses.total}</p>
                <p className={styles.cardStat}>Lessons {data.courses.lessons}</p>
                <p className={styles.cardStat}>Learners {data.courses.learners}</p>
                <p className={styles.cardStat}>
                  Completion rate {data.courses.completionRate}% ({data.courses.completions} of{" "}
                  {data.courses.learners})
                </p>
              </div>
            </div>

            <h2 className={styles.listTitle}>Revenue</h2>
            <div className={styles.grid}>
              <div className={styles.card} style={cardThemeVars("violet", { light: true })}>
                <h3 className={styles.cardTitle}>Subscriptions</h3>
                <p className={styles.cardStat}>
                  Active {sub.active} of {sub.total}
                </p>
                <p className={styles.cardStat}>
                  Cancelling at period end {sub.cancelAtPeriodEnd}
                </p>
                <p className={styles.cardStat}>
                  Est. monthly recurring {formatMoney(sub.estimatedMonthlyCents)}
                </p>
                <div className={styles.subBreakdown}>
                  <p className={styles.cardMeta}>
                    By tier:{" "}
                    {Object.entries(sub.byTier)
                      .map(([tier, count]) => `${tierLabels[tier] || tier} ${count}`)
                      .join(" · ")}
                  </p>
                  <p className={styles.cardMeta}>
                    By plan:{" "}
                    {Object.entries(sub.byPlan)
                      .map(([plan, count]) => `${planLabels[plan] || plan} ${count}`)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <div className={styles.card} style={cardThemeVars("amber", { light: true })}>
                <h3 className={styles.cardTitle}>One-time purchases</h3>
                <p className={styles.cardStat}>Total {purchases.total}</p>
                <p className={styles.cardStat}>Revenue {formatMoney(purchases.revenueCents)}</p>
                <p className={styles.cardMeta}>
                  By type:{" "}
                  {Object.entries(purchases.byType)
                    .map(([type, count]) => `${type} ${count}`)
                    .join(" · ")}
                </p>
              </div>
            </div>

            <h2 className={styles.listTitle}>Top content</h2>
            {data.topContent.length === 0 ? (
              <p className={styles.empty}>No engagement yet.</p>
            ) : (
              <div className={styles.list}>
                {data.topContent.map((post) => (
                  <div key={post.id} className={styles.item}>
                    <div>
                      <p className={styles.itemName}>{post.text}</p>
                      <p className={styles.itemMeta}>
                        by {post.authorName} · {post.likeCount} likes · {post.commentCount} comments
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 className={styles.listTitle}>Top members</h2>
            {data.topMembers.length === 0 ? (
              <p className={styles.empty}>No points yet.</p>
            ) : (
              <div className={styles.list}>
                {data.topMembers.map((entry) => (
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
          </>
        )}
      </div>
</Nav>
  );
}
