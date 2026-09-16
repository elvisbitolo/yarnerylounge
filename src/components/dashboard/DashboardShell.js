"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import StatCard from "./StatCard";
import AudienceChart from "./AudienceChart";
import RevenueChart from "./RevenueChart";
import {
  WelcomeBanner,
  QuickActions,
  CommunityHub,
  RecentActivity,
  UpcomingRooms,
  ContentPerformance,
  NeedsAttention,
} from "./Sections";
import { CardSkeleton, SectionError } from "./Section";
import styles from "./dashboard.module.css";

function formatMoney(cents) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function StatSkeleton() {
  return (
    <div className={styles.kpi} aria-hidden="true">
      <div className={styles.skeletonLine} style={{ width: "45%" }} />
      <div className={styles.skeletonLine} style={{ width: "60%", height: 22 }} />
    </div>
  );
}

export default function DashboardShell() {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/command")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load"))))
      .then((json) => {
        if (!active) return;
        if (json.ok) {
          setData(json.data);
          setFatal(false);
        } else {
          setFatal(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFatal(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  function handleRetry() {
    setLoading(true);
    setFatal(false);
    setRefresh((n) => n + 1);
  }

  function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function handleExport() {
    if (exporting) return;
    setExporting(true);
    fetch("/api/admin/analytics/export")
      .then((res) => {
        if (!res.ok) throw new Error("Export failed");
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `yarnery-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setExporting(false);
      })
      .catch(() => setExporting(false));
  }

  if (loading) {
    return (
      <div className={styles.pageWrap}>
        <div className={styles.page}>
          <div className={styles.skeletonLine} style={{ width: 220 }} />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 20 }}>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </div>
          <div className={styles.grid} style={{ marginTop: 20 }}>
            <div className={styles.col}>
              <CardSkeleton lines={5} />
              <CardSkeleton lines={3} />
            </div>
            <div className={styles.col}>
              <CardSkeleton lines={4} />
              <CardSkeleton lines={3} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (fatal || !data) {
    return (
      <div className={styles.pageWrap}>
        <div className={styles.page}>
          <SectionError
            message={t("dashboardLoadError")}
            onRetry={handleRetry}
          />
        </div>
      </div>
    );
  }

  const { user, isStaff, stats, activity, upcomingRooms, content, needsAttention, leaderboard } = data;

  const statsValue = stats?.ok ? stats.value : null;
  const activityValue = activity?.ok ? activity.value : [];
  const roomsValue = upcomingRooms?.ok ? upcomingRooms.value : [];
  const contentValue = content?.ok ? content.value : null;
  const attentionValue = needsAttention?.ok ? needsAttention.value : [];

  const kpis = [];
  if (statsValue) {
    kpis.push(
      <StatCard
        key="members"
        label={t("totalMembers")}
        value={statsValue.members.total.toLocaleString()}
        delta={statsValue.members.total ? Math.round((statsValue.members.new30 / statsValue.members.total) * 100) : 0}
        deltaLabel={t("newIn30d")}
        theme="indigo"
      />    );
    kpis.push(
      <StatCard
        key="live"
        label={t("liveViewers")}
        value={statsValue.live.viewers.toLocaleString()}
        deltaLabel={t("roomsLive", { count: statsValue.live.rooms })}
        theme="rose"
      />
    );
    if (isStaff && statsValue.revenue) {
      kpis.push(
        <StatCard
          key="revenue"
          label={t("estMonthlyRevenue")}
          value={formatMoney(statsValue.revenue.estMonthlyCents)}
          deltaLabel={t("activeSubscribers", { count: statsValue.revenue.activeSubs })}
          theme="amber"
        />
      );
    } else {
      kpis.push(
        <StatCard key="points" label={t("yourPoints")} value={(user.points || 0).toLocaleString()} deltaLabel={t("communityRecognition")} theme="emerald" />
      );
    }
    kpis.push(
      <StatCard
        key="engagement"
        label={t("engagement")}
        value={`${statsValue.engagement.contributionRate}%`}
        deltaLabel={t("activeThisWeek", { count: statsValue.engagement.active7 })}
        theme="sky"
      />
    );
  }

  return (
    <div className={styles.pageWrap}>
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.heading}>
            <h1>{t("title")}</h1>
            <p>
              {user.name} · {isStaff ? t("adminAndCreator") : t("member")}
            </p>
          </div>
          <div className={styles.headerRight} data-tour="tour-search">
            {isStaff && (
              <button
                type="button"
                className={styles.exportBtn}
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            )}
            <form className={styles.search} onSubmit={handleSearch}>
              <span className={styles.searchIcon}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
              </span>
              <input
                className={styles.searchInput}
                type="search"
                placeholder={t("searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search"
              />
            </form>
          </div>
        </div>

        <div data-tour="tour-welcome">
          <WelcomeBanner name={user.name} />
        </div>
        <div data-tour="tour-actions">
          <QuickActions isStaff={isStaff} />
        </div>

        <div data-tour="tour-community">
          <CommunityHub />
        </div>

        <div className={styles.kpiGrid} data-tour="tour-kpis">{kpis}</div>

        <div className={styles.grid}>
          <div className={styles.col}>
          {isStaff && (
            <div className={styles.card}>
              <AudienceChart />
            </div>
          )}
          {isStaff && (
            <div className={styles.card}>
              <RevenueChart />
            </div>
          )}

            {activity?.ok ? (
              <div data-tour="tour-activity">
                <RecentActivity data={activityValue} />
              </div>
            ) : (
              <SectionError message={t("activityLoadError")} onRetry={handleRetry} />
            )}

            {upcomingRooms?.ok ? (
              <div data-tour="tour-rooms">
                <UpcomingRooms data={roomsValue} />
              </div>
            ) : (
              <SectionError message={t("roomsLoadError")} onRetry={handleRetry} />
            )}
          </div>

          <div className={styles.col}>
            {needsAttention?.ok ? (
              <NeedsAttention data={attentionValue} />
            ) : (
              <SectionError message={t("queueLoadError")} onRetry={handleRetry} />
            )}

            {content?.ok ? (
              <ContentPerformance data={contentValue} />
            ) : (
              <SectionError message={t("contentLoadError")} onRetry={handleRetry} />
            )}

            {leaderboard?.ok && leaderboard.value.length > 0 && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>{t("recognition")}</h2>
                  <Link className={styles.cardLink} href="/leaderboard">
                    {t("leaderboard")}
                  </Link>
                </div>
                <ul className={styles.list}>
                  {leaderboard.value.map((entry) => (
                    <li key={entry.userId}>
                      <Link className={styles.item} href={`/members/${entry.userId}`}>
                        <span className={styles.itemSplit}>
                          <span className={styles.itemTitle}>
                            #{entry.rank} {entry.name}
                          </span>
                          <span className={styles.itemMeta}>
                            {t("pts", { points: entry.points, badges: entry.badgeCount })}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
