"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import styles from "./dashboard.module.css";
import { Card, EmptyState } from "./Section";
import { Users, Map, Images, Trophy } from "lucide-react";

function timeAgo(ms) {
  if (!ms) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CommunityNextSteps({ stats }) {
  const actions = [
    { href: "/messages", title: "Check your messages", detail: "Continue a conversation with another member." },
    { href: "/feed", title: "Join a discussion", detail: "Share an update or reply to a community post." },
    { href: "/members", title: "Meet members", detail: "Discover people in the community." },
    { href: "/events", title: "See what's coming up", detail: "Find an event or session to join." },
  ];

  const statsText = stats
    ? `Community has ${Number(stats.engagement?.active7) || 0} active members this week; ${Number(stats.members?.new30) || 0} joined in the last 30 days.`
    : "Find a conversation, meet someone new, or join an upcoming event.";

  return (
    <Card title="Make a connection today" theme="violet">
      <p className={styles.itemBody} style={{ marginBottom: 10 }}>
        {statsText}
      </p>
      <ul className={styles.list}>
        {actions.map((action) => (
          <li key={action.href}>
            <Link className={styles.item} href={action.href}>
              <span className={styles.itemSplit}>
                <span className={styles.itemTitle}>{action.title}</span>
                <span className={styles.cardLink} aria-hidden="true">→</span>
              </span>
              <span className={styles.itemBody}>{action.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ReturnVisitCard({ streak = 0, points = 0 }) {
  const hasStreak = Number(streak) > 0;

  return (
    <Card title="Your community streak" theme="amber" linkLabel="Leaderboard" linkHref="/leaderboard">
      <div className={styles.itemSplit}>
        <div>
          <p className={styles.chartValue}>{Number(streak) || 0} day{Number(streak) === 1 ? "" : "s"}</p>
          <p className={styles.itemBody}>
            {hasStreak
              ? "Keep showing up to build your streak."
              : "Visit the community each day to start building your streak."}
          </p>
        </div>
        <div>
          <p className={styles.chartValue}>{Number(points) || 0}</p>
          <p className={styles.itemBody}>community points</p>
        </div>
      </div>
      <p className={styles.itemMeta} style={{ marginTop: 12 }}>
        Join a discussion, connect with a member, or check upcoming events today.
      </p>
      <Link className={styles.spotCta} href="/feed" style={{ marginTop: 12 }}>
        Visit the feed
      </Link>
    </Card>
  );
}

export function WelcomeBanner({ name }) {
  const t = useTranslations("dashboard");
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <div className={styles.welcome}>
      <div>
        <h2 className={styles.welcomeTitle}>{t("welcomeBack", { name })}</h2>
        <p className={styles.welcomeSub}>{today}</p>
      </div>
      <div className={styles.welcomeActions}>
        <Link className={styles.welcomeLink} href="/rooms">
          {t("joinLiveRoom")}
        </Link>
        <Link className={styles.welcomeLink} href="/feed">
          {t("viewFeed")}
        </Link>
      </div>
    </div>
  );
}

const COMMUNITY_ICONS = { members: Users, neighbourhoods: Map, gallery: Images, leaderboard: Trophy };

export function CommunityHub() {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const links = [
    { href: "/members", key: "members", icon: "members" },
    { href: "/neighbourhoods", key: "neighbourhoods", icon: "neighbourhoods" },
    { href: "/gallery", key: "gallery", icon: "gallery" },
    { href: "/leaderboard", key: "leaderboard", icon: "leaderboard" },
  ];
  return (
    <Card title={t("communityHub")} linkLabel={t("exploreCommunity")} linkHref="/community" theme="violet">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
        className={styles.communityHubGrid}
      >
        {links.map((link) => (
          <Link
            key={link.href}
            className={styles.kpi}
            href={link.href}
            style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: 6, padding: 14 }}
          >
            <span className={styles.quickActionIcon} style={{ color: "var(--dash-accent, #f42e79)" }}>
              {(() => {
                const Icon = COMMUNITY_ICONS[link.icon];
                return Icon ? <Icon size={22} strokeWidth={1.8} aria-hidden="true" /> : null;
              })()}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#0a0e2a" }}>{tNav(link.key)}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

export function RecentActivity({ data }) {
  const t = useTranslations("dashboard");
  return (
    <Card title={t("recentActivity")} linkLabel={t("openFeed")} linkHref="/feed" theme="sky">
      {data.length === 0 ? (
        <EmptyState text={t("noActivity")} />
      ) : (
        <ul className={styles.list}>
          {data.map((item) => (
            <li key={item.id}>
              <Link className={styles.item} href={item.href}>
                <span className={styles.itemSplit}>
                  <span className={styles.itemTitle}>
                    {item.actor}
                    <span className={styles.itemMeta}> · <span className={styles.itemText}>{item.text}</span></span>
                  </span>
                  <span className={styles.itemMeta}>{timeAgo(item.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function UpcomingRooms({ data }) {
  const t = useTranslations("dashboard");
  return (
    <Card title={t("liveAndUpcoming")} linkLabel={t("allRooms")} linkHref="/rooms" theme="amber">
      {data.length === 0 ? (
        <EmptyState text={t("noRooms")} />
      ) : (
        <ul className={styles.list}>
          {data.map((item) => (
            <li key={item.id}>
              <Link className={`${styles.item} ${styles.itemRow}`} href={item.href}>
                <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span className={item.kind === "live" ? `${styles.dot} ${styles.dotLive}` : styles.dot} />
                  <span style={{ minWidth: 0 }}>
                    <span className={styles.itemTitle} style={{ display: "block" }}>
                      {item.title}
                    </span>
                    <span className={styles.itemMeta}>
                      {item.kind === "live" ? t("liveNow") : formatTime(item.startTime)}
                    </span>
                  </span>
                </span>
                {item.kind === "upcoming" && item.rsvpCount > 0 && (
                  <span className={`${styles.tag} ${styles.tagRsvp}`}>{t("rsvps", { count: item.rsvpCount })}</span>
                )}
                {item.kind === "live" && (
                  <span className={`${styles.tag} ${styles.tagLive}`}>{t("live")}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RecentMessages({ data }) {
  return (
    <Card title="Recent messages" linkLabel="Open chat" linkHref="/chat" theme="teal">
      {data.length === 0 ? (
        <EmptyState text="No messages yet. Start a conversation in Chat." />
      ) : (
        <ul className={styles.list}>
          {data.map((conv) => (
            <li key={conv.id}>
              <Link className={styles.item} href="/chat">
                <span className={styles.itemSplit}>
                  <span className={styles.itemTitle}>{conv?.title || conv?.name || "Chat"}</span>
                  <span className={styles.itemMeta}>{timeAgo(conv.lastMessageAt)}</span>
                </span>
                <span className={styles.itemBody}>{conv.lastMessage || "No messages yet"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ContentPerformance({ data }) {
  const t = useTranslations("dashboard");
  return (
    <Card title={t("topContent")} linkLabel={t("explore")} linkHref="/feed" theme="emerald">
      {!data || data.items.length === 0 ? (
        <EmptyState text={t("sharePosts")} />
      ) : (
        <ul className={styles.list}>
          {data.items.map((item) => (
            <li key={item.id}>
              <Link className={styles.item} href={item.href}>
                <span className={styles.itemSplit}>
                  <span className={styles.itemTitle} style={{ maxWidth: "70%" }}>
                    {item.title}
                  </span>
                  <span className={`${styles.tag} ${styles.tagRsvp}`}>
                    {item.score} eng.
                  </span>
                </span>
                <span className={styles.itemMeta}>
                  {t("byAuthor", { name: item.authorName })} · {t("likesAndComments", { likes: item.likeCount, comments: item.commentCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NotificationsPanel({ data }) {
  const unread = data.filter((n) => !n.read).length;
  return (
    <Card title="Notifications" linkLabel="View all" linkHref="/notifications" theme="fuchsia">
      {data.length === 0 ? (
        <EmptyState text="No notifications yet." />
      ) : (
        <ul className={styles.list}>
          {data.map((n) => (
            <li key={n.id}>
              <Link className={styles.item} href={n.href}>
                <span className={styles.itemSplit}>
                  <span className={styles.itemBody}>{n.text}</span>
                  {!n.read && <span className={`${styles.dot} ${styles.dotLive}`} />}
                </span>
                <span className={styles.itemMeta}>{timeAgo(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NeedsAttention({ data }) {
  const t = useTranslations("dashboard");
  return (
    <Card title={t("needsAttention")} theme="rose">
      {data.length === 0 ? (
        <EmptyState text={t("allCaughtUp")} />
      ) : (
        <ul className={styles.list}>
          {data.map((item) => (
            <li key={item.id}>
              <Link className={styles.attention} href={item.href}>
                <span className={styles.attentionIcon}>!</span>
                <span className={styles.attentionText}>{item.label}</span>
                <span className={styles.attentionMeta}>{t("review")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function OnboardingProgress({ data }) {
  const total = data?.total || 0;
  const done = data?.doneCount || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  if (total === 0) return null;
  return (
    <Card title={data.complete ? "Onboarding complete" : "Getting started"} theme="emerald">
      <p className={styles.chartCaption}>
        {done} of {total} steps complete
      </p>
      <div className={styles.progress}>
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>
      <ul className={styles.list}>
        {(data.steps || []).map((step, i) => {
          const isDone = i < done;
          return (
            <li key={step.key || i}>
              <Link className={styles.item} href={step.href || "/account"}>
                <span className={styles.itemSplit}>
                  <span className={styles.itemTitle}>
                    {isDone ? "✓ " : `${i + 1}. `}
                    {step.label}
                  </span>
                  {step.cta && <span className={styles.itemMeta}>{step.cta}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
