"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import StatCard from "./StatCard";
import {
  WelcomeBanner,
  QuickActions,
  CommunityHub,
  ContentPerformance,
} from "./Sections";
import EventsSpotlight from "./EventsSpotlight";
import ChristaLiveInvitation from "./ChristaLiveInvitation";
import { DashboardActiveMembers, DashboardStudioCard, DashboardFeaturedVideos, DashboardProfileCompletion, DashboardEngagementProgress } from "./DashboardCommunitySections";
import { CardSkeleton, SectionError } from "./Section";
import styles from "./dashboard.module.css";

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
  const [deferredLoading, setDeferredLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/command")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load"))))
      .then((json) => {
        if (!active) return;
        if (!json.ok) throw new Error("Failed to load dashboard");
        setData(json.data);
        setFatal(false);
        setLoading(false);
        setDeferredLoading(true);

        // Load analytics and lower-page sections after the first-screen
        // dashboard content is available. A failure here must not blank the
        // already-rendered dashboard.
        fetch("/api/dashboard/command/deferred")
          .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load details"))))
          .then((details) => {
            if (!active) return;
            if (!details.ok) throw new Error("Failed to load details");
            setData((current) => current ? { ...current, ...details.data } : current);
            setDeferredLoading(false);
          })
          .catch(() => {
            if (!active) return;
            setData((current) => current ? {
              ...current,
              stats: { ok: false, error: "Failed to load" },
              activity: { ok: false, error: "Failed to load" },
              content: { ok: false, error: "Failed to load" },
            } : current);
            setDeferredLoading(false);
          });
      })
      .catch(() => {
        if (!active) return;
        setFatal(true);
        setLoading(false);
        setDeferredLoading(false);
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

  const { user, isStaff, stats, spotlight, content } = data;

  const statsValue = stats?.ok ? stats.value : null;
  const contentValue = content?.ok ? content.value : null;

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
    kpis.push(
      <StatCard key="points" label={t("yourPoints")} value={(user.points || 0).toLocaleString()} deltaLabel={t("communityRecognition")} theme="emerald" />
    );
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
            <form className={styles.search} onSubmit={handleSearch}>
              <span className={styles.searchIcon}>
                <Search size={15} strokeWidth={2.2} aria-hidden="true" />
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
          <WelcomeBanner name={user.name} photoURL={user.photoURL} />
        </div>
        {/* What's On is a first-screen dashboard feature: keep it immediately
            below the welcome banner so members can see community activity. */}
        {spotlight && (
          spotlight.ok ? (
            <EventsSpotlight data={spotlight.value} />
          ) : (
            <SectionError message={t("spotlightLoadError")} onRetry={handleRetry} />
          )
        )}
        <DashboardProfileCompletion photoURL={user.photoURL} username={user.username} />
        <DashboardEngagementProgress />
        <DashboardFeaturedVideos />
        <DashboardStudioCard />
        <ChristaLiveInvitation />
        <DashboardActiveMembers />
        <div data-tour="tour-actions">
          <QuickActions isStaff={isStaff} />
        </div>

        <div data-tour="tour-community">
          <CommunityHub />
        </div>

        <div className={styles.kpiGrid} data-tour="tour-kpis">
          {deferredLoading ? (
            <>
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
            </>
          ) : kpis}
        </div>

        <section className={styles.dashboardInsightsGrid} aria-label="Community insights">
          <div className={styles.dashboardInsightTopContent}>
            {deferredLoading ? (
              <CardSkeleton lines={4} />
            ) : content?.ok ? (
              <ContentPerformance data={contentValue} />
            ) : (
              <SectionError message={t("contentLoadError")} onRetry={handleRetry} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
