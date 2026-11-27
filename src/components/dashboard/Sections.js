"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarDays, Check, CircleHelp, Image, MapPin, Package, PenLine, Plus, Radio, Trophy, UsersRound, Video } from "lucide-react";
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

export function WelcomeBanner({ name, photoURL }) {
  const t = useTranslations("dashboard");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const displayName = (name || "").trim() || "there";
  const initials = displayName.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "Y";
  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeIdentity}>
        {photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element -- member avatar from profile
          <img className={styles.welcomeAvatar} src={photoURL} alt="" />
        ) : (
          <span className={styles.welcomeAvatarFallback} aria-hidden="true">{initials}</span>
        )}
        <div>
          <h2 className={styles.welcomeTitle}>{greeting}, {displayName}</h2>
          <p className={styles.welcomeSub}>{today}</p>
        </div>
      </div>
      <div className={styles.welcomeActions}>
        <Link className={styles.welcomeLink} href="/rooms">
          {t("joinLiveRoom")}
        </Link>
        <Link className={styles.welcomeLink} href="/feed">
          {t("viewFeed")}
        </Link>
        <Link className={styles.welcomeLink} href="/membership">
          Manage membership
        </Link>
      </div>
    </div>
  );
}

function ActionIcon({ icon, size = 18 }) {
  const icons = {
    goLive: Radio,
    addProject: Package,
    askQuestion: CircleHelp,
    shareWin: Trophy,
    neighbourhoods: MapPin,
    members: UsersRound,
    post: PenLine,
    gallery: Image,
    leaderboard: Trophy,
    calendar: CalendarDays,
    video: Video,
  };
  const Icon = icons[icon] || PenLine;
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
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
          {data.map((item) => {
            const actorName = item.actor || "Member";
            const initials = actorName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "M";
            const profileHref = item.actorId ? `/members/${encodeURIComponent(item.actorId)}` : null;
            const avatar = item.actorPhotoUrl ? (
              <img className={styles.dashboardActivityAvatar} src={item.actorPhotoUrl} alt="" loading="lazy" />
            ) : (
              <span className={styles.dashboardActivityAvatarFallback} aria-hidden="true">{initials}</span>
            );
            return (
              <li key={item.id}>
                <div className={styles.dashboardActivityRow}>
                  {profileHref ? (
                    <Link className={styles.dashboardActivityActor} href={profileHref}>
                      {avatar}
                      <span className={styles.itemTitle}>{actorName}</span>
                    </Link>
                  ) : (
                    <span className={styles.dashboardActivityActor}>
                      {avatar}
                      <span className={styles.itemTitle}>{actorName}</span>
                    </span>
                  )}
                  <span className={styles.itemMeta}>{timeAgo(item.createdAt)}</span>
                  <Link className={styles.dashboardActivityText} href={item.href || "/feed"}>
                    {item.text}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function UpcomingRooms({ data }) {
  const t = useTranslations("dashboard");
  const [roomPresence, setRoomPresence] = useState({});
  const [presenceLoaded, setPresenceLoaded] = useState(false);
  const featuredRooms = (Array.isArray(data) ? data : []).filter(
    (item) => String(item.title || "").trim().toLocaleLowerCase() === "happy hour hub"
  );

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const loadPresence = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/dashboard/live-room-presence", { cache: "no-store" });
        if (!response.ok) throw new Error("Live lounge attendance unavailable");
        const result = await response.json();
        if (active && result.rooms && typeof result.rooms === "object") {
          setRoomPresence(result.rooms);
          setPresenceLoaded(true);
        }
      } catch {
        // Keep the last successful snapshot; the lounge remains accessible.
      } finally {
        inFlight = false;
      }
    };

    loadPresence();
    const interval = setInterval(loadPresence, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <Card title={t("liveAndUpcoming")} linkLabel={t("allRooms")} linkHref="/rooms" theme="amber">
      {featuredRooms.length === 0 ? (
        <EmptyState text="Happy Hour Hub is not open right now." />
      ) : (
        <div className={styles.dashboardRoomGrid}>
          {featuredRooms.map((item) => {
            const members = item.kind === "live" && presenceLoaded
              ? (roomPresence[item.slug] || [])
              : [];
            const viewerCount = presenceLoaded && item.kind === "live"
              ? members.length
              : item.viewerCount || 0;
            const hasPeople = item.kind === "live" && viewerCount > 0;
            const statusLabel = item.kind === "live"
              ? (hasPeople ? "LIVE NOW" : "OPEN NOW")
              : "UPCOMING";
            const visibleMembers = members.slice(0, 8);
            const memberNames = members.slice(0, 2).map((member) => member.name).filter(Boolean);
            const remainingMembers = Math.max(0, viewerCount - memberNames.length);

            return (
              <article
                key={item.id}
                className={styles.dashboardRoomCard}
                style={{ "--dashboard-room-accent": item.color || "var(--dash-accent, #f6077a)" }}
              >
                <Link className={styles.dashboardRoomCover} href={item.href} aria-label={`Enter ${item.title}`}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className={styles.dashboardRoomCoverFallback} aria-hidden="true">
                      {(item.title || "L").trim().slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className={`${styles.dashboardRoomStatus} ${item.kind === "live" ? styles.dashboardRoomStatusLive : styles.dashboardRoomStatusUpcoming}`}>
                    {statusLabel}
                  </span>
                </Link>
                <div className={styles.dashboardRoomInfo}>
                  <strong className={styles.dashboardRoomTitle}>{item.title}</strong>
                  {item.description ? <span className={styles.dashboardRoomDescription}>{item.description}</span> : null}
                  {item.kind === "live" ? (
                    <div className={styles.dashboardRoomAttendance}>
                      {visibleMembers.length ? (
                        <div className={styles.dashboardRoomAvatars} aria-label={`${viewerCount} members inside Happy Hour Hub`}>
                          {visibleMembers.map((member) => {
                            const name = member.name || "Member";
                            const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "M";
                            return (
                              <Link
                                className={styles.dashboardRoomAttendeeProfile}
                                href={`/members/${encodeURIComponent(member.userId)}`}
                                aria-label={`View ${name}'s profile`}
                                title={`View ${name}'s profile`}
                                key={member.userId}
                              >
                                {member.photoURL ? (
                                  <img className={styles.dashboardRoomAttendeeAvatar} src={member.photoURL} alt="" loading="lazy" />
                                ) : (
                                  <span className={styles.dashboardRoomAttendeeFallback} aria-hidden="true">{initials}</span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                      {hasPeople ? (
                        <span className={styles.dashboardRoomAttendanceText}>
                          {memberNames.length
                            ? `Inside now: ${memberNames.join(", ")}${remainingMembers ? ` +${remainingMembers} more` : ""}`
                            : `${viewerCount} ${viewerCount === 1 ? "person" : "people"} inside`}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className={styles.dashboardRoomMeta}>
                      {formatTime(item.startTime)}
                      {item.rsvpCount > 0 ? ` · ${item.rsvpCount} going` : ""}
                    </span>
                  )}
                  <Link className={styles.dashboardRoomCta} href={item.href}>
                    {item.kind === "live" ? "Enter lounge" : "View session"} <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
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

export function DashboardMemberAvatar({ name, photoURL, className = "" }) {
  const initials = (name || "Member").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "M";
  const avatarClass = [styles.dashboardMemberAvatar, className].filter(Boolean).join(" ");
  const fallbackClass = [styles.dashboardMemberAvatarFallback, className].filter(Boolean).join(" ");
  return photoURL ? (
    <img className={avatarClass} src={photoURL} alt="" loading="lazy" />
  ) : (
    <span className={fallbackClass} aria-hidden="true">{initials}</span>
  );
}
export function ContentPerformance({ data }) {
  const t = useTranslations("dashboard");
  return (
    <Card title={t("topContent")} linkLabel={t("explore")} linkHref="/feed" theme="emerald">
      {!data || data.items.length === 0 ? (
        <EmptyState text={t("sharePosts")} />
      ) : (
        <ul className={`${styles.list} ${styles.dashboardContentList}`}>
          {data.items.map((item) => (
            <li className={styles.dashboardContentListItem} key={item.id}>
              <div className={styles.dashboardContentItem}>
                {item.authorId ? (
                  <Link className={styles.dashboardContentAuthor} href={`/members/${encodeURIComponent(item.authorId)}`}>
                    <DashboardMemberAvatar name={item.authorName} photoURL={item.authorPhotoUrl} />
                    <span className={styles.itemTitle}>{item.authorName || "Member"}</span>
                  </Link>
                ) : (
                  <span className={styles.dashboardContentAuthor}>
                    <DashboardMemberAvatar name={item.authorName} photoURL={null} />
                    <span className={styles.itemTitle}>{item.authorName || "Member"}</span>
                  </span>
                )}
                <Link className={styles.dashboardContentBody} href={item.href}>
                  <span className={styles.dashboardContentPostHeading}>
                    <span className={styles.itemTitle}>{item.title}</span>
                    <span className={`${styles.tag} ${styles.tagRsvp}`}>{item.score} eng.</span>
                  </span>
                  <span className={styles.itemMeta}>
                    {t("likesAndComments", { likes: item.likeCount, comments: item.commentCount })}
                  </span>
                </Link>
              </div>
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
                    {isDone ? <Check size={14} aria-hidden="true" /> : `${i + 1}. `}
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
