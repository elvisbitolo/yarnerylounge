"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import NotificationBell from "./NotificationBell";
import LanguageSwitcher from "./LanguageSwitcher";
import ProfileMenu from "./ProfileMenu";
import SidebarProfile from "./SidebarProfile";
import LiveNowBanner from "./LiveNowBanner";
import styles from "./Nav.module.css";
const CHEVRON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function SearchForm({ className }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
      setQuery("");
    }
  }

  return (
    <form className={className || styles.topbarSearchWrap} onSubmit={handleSearch} role="search">
      <span className={styles.topbarSearchIcon}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      </span>
      <input
        className={styles.topbarInput}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
      />
    </form>
  );
}

function getAdministrationLinks(role) {
  if (role === "owner") {
    return [
      { href: "/admin/analytics", key: "analytics" },
      { href: "/admin/rooms", key: "manageRooms" },
      { href: "/admin/courses", key: "manageCourses" },
      { href: "/admin/collections", key: "collections" },
      { href: "/admin/questions", key: "questions" },
      { href: "/admin/hosts", key: "scopedHosts" },
      { href: "/admin/moderation", key: "moderation" },
      { href: "/admin/automations", key: "automations" },
      { href: "/admin/announcements", key: "announcements" },
    ];
  }
  if (role === "moderator") {
    return [
      { href: "/admin/hosts", key: "scopedHosts" },
      { href: "/admin/moderation", key: "moderation" },
    ];
  }
  return [];
}

const OVERVIEW_ITEMS = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/feed", key: "feed" },
  { href: "/dashboard/membership", key: "membership" },
];

const CONNECT_ITEMS = [
  { href: "/rooms", key: "rooms" },
  { href: "/calendar", key: "calendar" },
  { href: "/events", key: "events" },
  { href: "/challenges", key: "crochetAlong" },
  { href: "/members", key: "members" },
];

const LEARN_ITEMS = [
  { href: "/courses", key: "courses" },
  { href: "/articles", key: "articles" },
];

function SidebarGroup({ id, label, items, open, onToggle, t, close, children }) {
  const isOpen = open.has(id);
  return (
    <div>
      <button type="button" className={styles.groupToggle} onClick={() => onToggle(id)} aria-expanded={isOpen}>
        <span className={styles.groupLabel}>{label}</span>
        <span className={isOpen ? `${styles.groupChevron} ${styles.groupChevronOpen}` : styles.groupChevron}>{CHEVRON}</span>
      </button>
      <div className={isOpen ? `${styles.groupBody} ${styles.groupBodyOpen}` : styles.groupBody}>
        {items && items.map((item) => (
          <Link key={item.href} className={styles.sidebarLink} href={item.href} onClick={close}>
            {t(item.key)}
          </Link>
        ))}
        {children}
      </div>
    </div>
  );
}

export default function Nav({ role, children }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const isRoomPage = pathname?.startsWith("/rooms/");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("sidebarCollapsed") === "1"
  );
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [collections, setCollections] = useState([]);
  const [hasHostTools, setHasHostTools] = useState(
    () => role === "owner" || role === "moderator" || role === "host"
  );
  const [mobileSearch, setMobileSearch] = useState(false);
  const [sidebarData, setSidebarData] = useState(null);
  const administrationLinks = getAdministrationLinks(role);
  const close = () => setMobileOpen(false);

  useEffect(() => {
    let active = true;
    fetch("/api/sidebar")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (active && json?.ok) setSidebarData(json.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function toggleGroup(id) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    const allGroups = [
      { id: "overview", items: OVERVIEW_ITEMS },
      { id: "connect", items: CONNECT_ITEMS },
      { id: "learn", items: LEARN_ITEMS },
      { id: "administration", items: administrationLinks },
      { id: "host", items: hasHostTools && role !== "owner" ? [{ href: "/host" }] : [] },
    ];
    const matched = allGroups
      .filter((g) => g.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/")))
      .map((g) => g.id);
    if (matched.length) {
      setOpenGroups((prev) => {
        const next = new Set(prev);
        matched.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [pathname, administrationLinks, hasHostTools, role]);

  useEffect(() => {
    window.localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  }

  useEffect(() => {
    fetch("/api/collections")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data)) {
          setCollections(data.filter((collection) => collection.spaces.length > 0));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (role === "owner" || role === "moderator") return;
    fetch("/api/host/scopes")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setHasHostTools(data.scopes.length > 0);
      })
      .catch(() => {});
  }, [role]);

  return (
    <>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button
            type="button"
            className={mobileOpen ? `${styles.burger} ${styles.burgerOpen}` : styles.burger}
            onClick={toggleSidebar}
            aria-expanded={mobileOpen || !collapsed}
            aria-controls="sidebar-menu"
            aria-label={t("toggleNav")}
          >
            <span className={styles.burgerLine} />
            <span className={styles.burgerLine} />
            <span className={styles.burgerLine} />
          </button>
          <Link className={styles.brand} href="/dashboard" onClick={close}>
            <Image
              src="/brand/secretyarnery-logo.webp"
              alt="Secret Yarnery"
              width={90}
              height={28}
              className={styles.brandLogo}
              priority
            />
          </Link>
        </div>
        <div className={styles.topbarCenter}>
          <SearchForm />
        </div>
        <div className={styles.topbarRight}>
          <button
            type="button"
            className={`${styles.topbarIconBtn} ${styles.topbarSearchMobile}`}
            onClick={() => setMobileSearch(true)}
            aria-label={t("searchPlaceholder")}
            title={t("searchPlaceholder")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
          </button>
          <NotificationBell />
          <LanguageSwitcher />
          <ProfileMenu />
        </div>
      </header>
      {mobileSearch && (
        <div className={styles.mobileSearchOverlay}>
          <SearchForm />
          <button
            type="button"
            className={styles.topbarIconBtn}
            onClick={() => setMobileSearch(false)}
            aria-label={t("toggleNav")}
            title={t("toggleNav")}
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.shell}>
        <aside
          id="sidebar-menu"
          className={
            mobileOpen
              ? `${styles.sidebar} ${styles.sidebarOpen}`
              : collapsed
                ? `${styles.sidebar} ${styles.sidebarCollapsed}`
                : styles.sidebar
          }
        >
          <div className={styles.sidebarInner} data-tour="tour-sidebar">
            <nav className={styles.sidebarNav}>
              <SidebarGroup id="overview" label={t("overview")} items={OVERVIEW_ITEMS} open={openGroups} onToggle={toggleGroup} t={t} close={close} />
              <SidebarGroup id="connect" label={t("connect")} items={CONNECT_ITEMS} open={openGroups} onToggle={toggleGroup} t={t} close={close} />
              <SidebarGroup id="learn" label={t("learn")} items={LEARN_ITEMS} open={openGroups} onToggle={toggleGroup} t={t} close={close} />

              {collections.length > 0 && (
                <SidebarGroup id="collections" label={t("collections")} open={openGroups} onToggle={toggleGroup} t={t} close={close}>
                  {collections.map((collection) => (
                    <div key={collection.id} className={styles.collection}>
                      <p className={styles.collectionName}>{collection.name}</p>
                      {collection.spaces.map((space) => (
                        <Link key={space.id} className={styles.sidebarLinkNested} href={`/spaces/${space.slug}`} onClick={close}>
                          {space.name}
                        </Link>
                      ))}
                    </div>
                  ))}
                </SidebarGroup>
              )}

              {hasHostTools && role !== "owner" && (
                <SidebarGroup id="host" label={t("host")} items={[{ href: "/host", key: "hostTools" }]} open={openGroups} onToggle={toggleGroup} t={t} close={close} />
              )}

              {administrationLinks.length > 0 && (
                <SidebarGroup id="administration" label={t("administration")} items={administrationLinks} open={openGroups} onToggle={toggleGroup} t={t} close={close} />
              )}
            </nav>
            <SidebarProfile
              points={sidebarData?.points}
              streak={sidebarData?.streak}
              close={close}
            />
          </div>
        </aside>

        {mobileOpen && (
          <div className={styles.backdrop} onClick={close} aria-hidden="true" />
        )}

        <div className={styles.content}>
          {!isRoomPage && <LiveNowBanner />}
          {children}
        </div>
      </div>
    </>
  );
}
