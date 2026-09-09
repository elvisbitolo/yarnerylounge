"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import styles from "./dashboard.module.css";
import { Card, EmptyState } from "./Section";

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

function ActionIcon({ icon }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  switch (icon) {
    case "goLive":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          <path d="M7 7a8 8 0 0 0 0 10M17 7a8 8 0 0 1 0 10M4.5 4.5a12 12 0 0 0 0 15M19.5 4.5a12 12 0 0 1 0 15" />
        </svg>
      );
    case "addProject":
      return (
        <svg {...common}>
          <path d="M12 2l9 4.9v10.2L12 22l-9-4.9V6.9L12 2z" />
          <path d="M12 2v20M3 6.9l9 4.9 9-4.9" />
        </svg>
      );
    case "askQuestion":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.6 9a2.4 2.4 0 1 1 3.9 1.9c-.9.7-1.5 1.2-1.5 2.6" />
          <circle cx="12" cy="16.8" r="0.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "shareWin":
      return (
        <svg {...common}>
          <path d="M6 9H4.5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1.5M6 9h12v10H6V9z" />
          <path d="M6 9V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3M15 15l1.5 4-3-2-3 2 1.5-4a3.5 3.5 0 1 1 3-3.5M9.5 15a6 6 0 1 1 9 .5" />
        </svg>
      );
    case "neighbourhoods":
      return (
        <svg {...common}>
          <path d="M6 20c2 0 4-1.5 4.5-.5z" />
          <path d="M14 20c2 0 4-1.5 4.5-.5z" />
          <path d="M6 20l4-3M14 20l-2-4M4 15l2-6M10 13l3-5" />
        </svg>
      );
    case "members":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M17.5 15c2.4.3 4 1.7 4.5 4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      );
  }
}

export function QuickActions() {
  const t = useTranslations("dashboard");
  const actions = [
    { key: "post", href: "/feed", icon: "post" },
    { key: "joinARoom", href: "/rooms", icon: "goLive" },
    { key: "neighbourhoods", href: "/neighbourhoods", icon: "neighbourhoods" },
    { key: "members", href: "/members", icon: "members" },
  ];
  return (
    <Card title={t("quickActions")} theme="sky">
      <div
        className={styles.quickActions}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
          gap: 10,
        }}
      >
        {actions.map((action) => (
          <Link
            key={action.key}
            className={styles.kpi}
            href={action.href}
            style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: 7, padding: 14 }}
          >
            <span className={styles.quickActionIcon}>
              <ActionIcon icon={action.icon} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#0a0e2a" }}>{t(action.key)}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

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
              <ActionIcon icon={link.icon} />
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
                    <span className={styles.itemMeta}> · {item.text}</span>
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
                  <span className={styles.itemTitle}>{conv.title}</span>
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
