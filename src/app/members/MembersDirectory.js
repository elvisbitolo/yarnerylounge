"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MemberBadge from "@/components/MemberBadge";
import { roleBadgeLabel } from "@/lib/profile/roles";
import { countryNames } from "@/lib/profile/countries";
import { composeLayout } from "./avatarLayout";
import MembersMap from "./MembersMap";
import styles from "./members.module.css";

const TABS = [
  { key: "all", label: "All" },
  { key: "lounge", label: "In the lounge" },
  { key: "online", label: "Online today" },
  { key: "newest", label: "Newest" },
  { key: "top", label: "Top" },
  { key: "hosts", label: "Hosts" },
];

const CRAFTS = [
  { value: "crochet", label: "Crochet" },
  { value: "knitting", label: "Knitting" },
  { value: "weaving", label: "Weaving" },
  { value: "spinning", label: "Spinning" },
  { value: "dyeing", label: "Dyeing" },
  { value: "embroidery", label: "Embroidery" },
  { value: "macrame", label: "Macrame" },
];

const HOBBIES = [
  { value: "cooking", label: "Cooking" },
  { value: "baking", label: "Baking" },
  { value: "gardening", label: "Gardening" },
  { value: "thrifting", label: "Thrifting" },
  { value: "yoga", label: "Yoga" },
  { value: "pottery", label: "Pottery" },
  { value: "painting", label: "Painting" },
  { value: "photography", label: "Photography" },
  { value: "reading", label: "Reading" },
  { value: "antiquing", label: "Antiquing" },
  { value: "sewing", label: "Sewing" },
  { value: "woodworking", label: "Woodworking" },
  { value: "board games", label: "Board games" },
  { value: "card games", label: "Card games" },
];

const PRESETS = {
  desktop: { width: 960, height: 560 },
  tablet: { width: 720, height: 540 },
  mobile: { width: 480, height: 700 },
};

function craftLabel(value) {
  return CRAFTS.find((c) => c.value === value)?.label || value;
}

function commoStrings(viewer, member) {
  const found = [];
  if (!viewer || !member) return found;
  if (viewer.country && viewer.country === member.country) {
    found.push(`Both in ${member.country}`);
  }
  if (viewer.goToYarn && viewer.goToYarn === member.goToYarn) {
    found.push(`Both love ${member.goToYarn}`);
  }
  if (viewer.favoriteHookSize && viewer.favoriteHookSize === member.favoriteHookSize) {
    found.push(`Both use a ${member.favoriteHookSize}`);
  }
  if (Array.isArray(viewer.favoriteColors) && Array.isArray(member.favoriteColors)) {
    const overlap = viewer.favoriteColors.filter((c) => member.favoriteColors.includes(c));
    if (overlap.length > 0) {
      found.push(`${overlap.length} favorite ${overlap.length === 1 ? "color" : "colors"} in common`);
    }
  }
  if (Array.isArray(viewer.crafts) && Array.isArray(member.crafts)) {
    const overlap = viewer.crafts.filter((c) => member.crafts.includes(c));
    if (overlap.length > 0) {
      found.push(
        `${overlap.length} shared ${overlap.length === 1 ? "craft" : "crafts"}: ${overlap.map(craftLabel).join(", ")}`
      );
    }
  }
  if (Array.isArray(viewer.hobbies) && Array.isArray(member.hobbies)) {
    const overlap = viewer.hobbies.filter((h) => member.hobbies.includes(h));
    if (overlap.length > 0) {
      found.push(`${overlap.length} shared ${overlap.length === 1 ? "hobby" : "hobbies"} in common`);
    }
  }
  if (Array.isArray(viewer.crochetTechniques) && Array.isArray(member.crochetTechniques)) {
    const overlap = viewer.crochetTechniques.filter((t) => member.crochetTechniques.includes(t));
    if (overlap.length > 0) {
      found.push(`${overlap.length} shared technique${overlap.length === 1 ? "" : "s"}`);
    }
  }
  return found.slice(0, 4);
}

function distinct(values) {
  return [...new Set(values.filter((v) => v && v.trim()))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function colorStrip(colors) {
  const list = (Array.isArray(colors) ? colors : []).filter((c) =>
    /^#[0-9a-fA-F]{6}$/.test(c)
  );
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  const segments = list.map((c, i) => `${c} ${(i / list.length) * 100}% ${((i + 1) / list.length) * 100}%`);
  return `conic-gradient(${segments.join(", ")})`;
}

function initialsOf(member) {
  return (member.name || "?").slice(0, 1).toUpperCase();
}

function useViewportKey() {
  const [key, setKey] = useState("desktop");
  useEffect(() => {
    const queries = [
      { key: "mobile", mql: window.matchMedia("(max-width: 640px)") },
      { key: "tablet", mql: window.matchMedia("(min-width: 641px) and (max-width: 1023px)") },
      { key: "desktop", mql: window.matchMedia("(min-width: 1024px)") },
    ];
    const apply = () =>
      setKey((queries.find((q) => q.mql.matches) || queries[queries.length - 1]).key);
    apply();
    queries.forEach((q) => q.mql.addEventListener("change", apply));
    return () => queries.forEach((q) => q.mql.removeEventListener("change", apply));
  }, []);
  return key;
}

const TOOLTIP_W = 300;
const TOOLTIP_H = 400;
const HIDE_DELAY = 220;

export default function MembersDirectory({ members, viewer, role, todayKey, matchmakerEnabled = true }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [country, setCountry] = useState("");
  const [craft, setCraft] = useState("");
  const [hobby, setHobby] = useState("");
  const [timezone, setTimezone] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const [matchTarget, setMatchTarget] = useState(null);
  const hideTimer = useRef(null);

  const viewportKey = useViewportKey();
  const frameRef = useRef(null);
  const [frameWidth, setFrameWidth] = useState(0);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setFrameWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const preset = PRESETS[viewportKey];
  const scale = frameWidth > 0 ? frameWidth / preset.width : 0;

  function showDetails(member, e) {
    clearTimeout(hideTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setHover({ member, rect, common: commoStrings(viewer, member) });
  }

  function scheduleHide() {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), HIDE_DELAY);
  }

  function keepOpen() {
    clearTimeout(hideTimer.current);
  }

  const tooltipPos = (() => {
    if (!hover) return null;
    const vw = typeof window !== "undefined" ? window.innerWidth : 800;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    const cx = hover.rect.left + hover.rect.width / 2;
    const left = Math.max(8, Math.min(cx - TOOLTIP_W / 2, vw - TOOLTIP_W - 8));
    let top = hover.rect.bottom + 12;
    if (top + TOOLTIP_H > vh) {
      top = Math.max(8, hover.rect.top - TOOLTIP_H - 12);
    }
    return { left, top };
  })();

  const countries = useMemo(() => {
    const all = countryNames();
    const inUse = distinct(members.map((m) => m.country));
    return [...all, ...inUse.filter((c) => !all.includes(c))];
  }, [members]);

  const timezones = useMemo(() => distinct(members.map((m) => m.timezone)), [members]);

  const hobbiesInUse = useMemo(
    () => distinct(([]).concat(members.flatMap((m) => (Array.isArray(m.hobbies) ? m.hobbies : [])))),
    [members]
  );

  const hobbyOptions = useMemo(() => {
    const known = new Map(HOBBIES.map((h) => [h.value, h.label]));
    const used = hobbiesInUse.map((h) => ({ value: h, label: known.get(h) || h }));
    return used.sort((a, b) => a.label.localeCompare(b.label));
  }, [hobbiesInUse]);

  const query = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    const pool = members.filter((member) => {
      if (tab === "lounge" && !member.live) return false;
      if (tab === "online" && member.lastVisitDate !== todayKey) return false;
      if (tab === "hosts" && member.role !== "owner" && member.role !== "moderator") return false;
      if (craft && !member.crafts?.includes(craft)) return false;
      if (country && member.country !== country) return false;
      if (timezone && member.timezone !== timezone) return false;
      if (hobby && !(Array.isArray(member.hobbies) && member.hobbies.includes(hobby))) return false;
      if (!query) return true;
      return (
        member.name?.toLowerCase().includes(query) ||
        member.headline?.toLowerCase().includes(query) ||
        member.location?.toLowerCase().includes(query) ||
        member.country?.toLowerCase().includes(query) ||
        member.bio?.toLowerCase().includes(query) ||
        (Array.isArray(member.hobbies) &&
          member.hobbies.some((h) => h.toLowerCase().includes(query)))
      );
    });
    if (tab === "newest") {
      return [...pool].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    if (tab === "top") {
      return [...pool].sort((a, b) => (b.points || 0) - (a.points || 0));
    }
    return [...pool].sort((a, b) => a.name.localeCompare(b.name));
  }, [members, tab, query, country, timezone, craft, hobby, todayKey]);

  const activeFilterCount = [country, hobby, timezone].filter(Boolean).length;

  const DENSE_BASE = 20;
  const DENSE_STEP = Math.round((14 * 960) / preset.width);
  const virtualHeight =
    preset.height +
    Math.max(0, filtered.length - DENSE_BASE) * DENSE_STEP;
  const frameHeight = Math.round(virtualHeight * Math.max(scale, 1));

  const placed = useMemo(
    () =>
      composeLayout(filtered, {
        width: preset.width,
        height: virtualHeight,
      }),
    [filtered, preset, virtualHeight]
  );

  const memberById = useMemo(
    () => new Map(filtered.map((m) => [m.id, m])),
    [filtered]
  );

  return (
    <>
      <div className={styles.controls}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search members by name, headline, or location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.filters}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? `${styles.filterBtn} ${styles.filterActive}` : styles.filterBtn}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {matchmakerEnabled && (
      <div className={styles.matchmakerPanel}>
        <p className={styles.matchmakerTitle}>
          <span className={styles.matchmakerSparkle}>✦</span> Find Members
        </p>
        <div className={styles.filterBar}>
          <button
            type="button"
            className={filtersOpen ? `${styles.filtersToggle} ${styles.filtersToggleActive}` : styles.filtersToggle}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-haspopup="true"
          >
            <span className={styles.filtersToggleIcon} aria-hidden="true">⚙</span>
            Filters
            {activeFilterCount > 0 && <span className={styles.filtersBadge}>{activeFilterCount}</span>}
          </button>
        </div>
        {filtersOpen && (
          <div className={styles.filtersDropdown}>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Location</span>
              <select
                className={styles.locationSelect}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-label="Filter by location"
              >
                <option value="">All countries</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Hobbies</span>
              <select
                className={styles.locationSelect}
                value={hobby}
                onChange={(e) => setHobby(e.target.value)}
                aria-label="Filter by hobby"
              >
                <option value="">All hobbies</option>
                {hobbyOptions.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Timezone</span>
              <select
                className={styles.locationSelect}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                aria-label="Filter by timezone"
              >
                <option value="">All timezones</option>
                {timezones.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className={styles.craftRow}>
          <span className={styles.craftLabel}>Crafts</span>
          <button
            className={!craft ? `${styles.craftChip} ${styles.craftActive}` : styles.craftChip}
            onClick={() => setCraft("")}
          >
            All
          </button>
          {CRAFTS.map((c) => (
            <button
              key={c.value}
              className={craft === c.value ? `${styles.craftChip} ${styles.craftActive}` : styles.craftChip}
              onClick={() => setCraft(craft === c.value ? "" : c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {query || tab !== "all" || country || timezone || craft || hobby
            ? "No members match this view."
            : "No members yet."}
        </p>
      ) : (
        <div className={styles.canvasFrame} ref={frameRef} style={{ height: frameHeight }}>
          <span className={styles.canvasGlow} aria-hidden="true" />
          {scale > 0 && (
            <div
              className={styles.canvasLayer}
              style={{ width: preset.width, height: preset.height, transform: `scale(${scale})` }}
            >
              {placed.map((slot) => {
                const member = memberById.get(slot.id);
                if (!member) return null;
                const ring = colorStrip(member.favoriteColors);
                return (
                  <Link
                    key={member.id}
                    href={`/members/${member.id}`}
                    className={styles.avatarPos}
                    style={{
                      left: slot.left,
                      top: slot.top,
                      width: slot.size,
                      height: slot.size,
                      zIndex: slot.z,
                    }}
                    onMouseEnter={(e) => showDetails(member, e)}
                    onMouseLeave={scheduleHide}
                    onFocus={(e) => showDetails(member, e)}
                    onBlur={scheduleHide}
                    aria-label={`View ${member.name}`}
                  >
                    <span
                      className={ring ? `${styles.ring} ${styles.ringActive}` : styles.ring}
                      style={ring ? { background: ring, padding: 3 } : undefined}
                    >
                      <span
                        className={styles.circle}
                        style={{ fontSize: slot.size * 0.32 }}
                      >
                        {member.photoURL ? (
                          <img
                            className={styles.circleImage}
                            src={member.photoURL}
                            alt={member.name}
                          />
                        ) : (
                          initialsOf(member)
                        )}
                        {member.role === "owner" && (
                          <span className={styles.hostDot}>{roleBadgeLabel(member.role, member.roleLabel)}</span>
                        )}
                        {member.role === "moderator" && <span className={styles.hostDot}>Mod</span>}
                        {member.foundingMember && (
                          <span className={`${styles.hostDot} ${styles.foundDot}`} title="Founding Yarnie">🧶</span>
                        )}
                        {(member.plan === "hooking-up" || member.plan === "moving-in") && slot.size >= 34 && (
                          <span
                            className={styles.tierDot}
                            title={member.plan === "moving-in" ? "Moving In member" : "Hooking Up member"}
                          >
                            <MemberBadge plan={member.plan} size={12} tooltip={false} />
                          </span>
                        )}
                      </span>
                    </span>
                    {member.live && <span className={styles.liveDot} />}
                  </Link>
                );
              })}
      </div>
          )}
        </div>
      )}

      <MembersMap members={filtered} selectedCountry={country} onSelectCountry={setCountry} />

      {hover && tooltipPos && (
        <div
          className={styles.tooltip}
          style={{ left: tooltipPos.left, top: tooltipPos.top }}
          onMouseEnter={keepOpen}
          onMouseLeave={scheduleHide}
        >
          <div className={styles.tooltipTop}>
            <span className={styles.tooltipAvatar}>
              {hover.member.photoURL ? (
                <img
                  className={styles.tooltipAvatarImg}
                  src={hover.member.photoURL}
                  alt=""
                />
              ) : (
                initialsOf(hover.member)
              )}
            </span>
            <div className={styles.tooltipMeta}>
              <p className={styles.tooltipName}>
                {hover.member.name}
                <MemberBadge plan={hover.member.plan} role={hover.member.role} size={13} />
                {hover.member.foundingMember && (
                  <span className={styles.tooltipFounding} title="Founding Yarnie · first 100 members">🧶</span>
                )}
              </p>
              <p className={styles.tooltipUsername}>
                @{hover.member.username || "member"}
              </p>
            </div>
            {hover.member.live && <span className={styles.tooltipLiveBadge}>● Live</span>}
          </div>
          {hover.member.headline && <p className={styles.tooltipHeadline}>{hover.member.headline}</p>}
          {hover.member.bio && <p className={styles.tooltipBio}>{hover.member.bio}</p>}
          {hover.member.location && (
            <p className={styles.tooltipLocation}>📍 {hover.member.location}</p>
          )}
          {hover.member.country && (
            <p className={styles.tooltipLocation}>{hover.member.country}</p>
          )}
          {hover.member.crafts?.length > 0 && (
            <p className={styles.tooltipCrafts}>{hover.member.crafts.map(craftLabel).join(" · ")}</p>
          )}
          {hover.member.hobbies?.length > 0 && (
            <p className={styles.tooltipHobbies}>
              <span className={styles.tooltipHobbyIcon}>✦</span>{" "}
              {hover.member.hobbies.slice(0, 5).join(" · ")}
            </p>
          )}
          {hover.member.favoriteColors?.length > 0 && (
            <span className={styles.tooltipDots}>
              {hover.member.favoriteColors.map((color, i) => (
                <span
                  key={i}
                  className={styles.tooltipDot}
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
          )}
          {hover.common?.length > 0 && (
            <div className={styles.tooltipCommon}>
              <p className={styles.tooltipCommonTitle}>In common</p>
              <ul className={styles.tooltipCommonList}>
                {hover.common.map((item, i) => (
                  <li key={i} className={styles.tooltipCommonItem}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={styles.tooltipActions}>
            <button
              type="button"
              className={`${styles.tooltipAction} ${styles.tooltipActionMatch}`}
              onClick={() => setMatchTarget(hover.member)}
            >
              ✦ Match
            </button>
            <Link
              className={styles.tooltipAction}
              href={`/chat?with=${hover.member.id}`}
              onClick={() => setHover(null)}
            >
              💬 Message
            </Link>
            <Link
              className={`${styles.tooltipAction} ${styles.tooltipActionPrimary}`}
              href={`/members/${hover.member.id}`}
              onClick={() => setHover(null)}
            >
              View profile
            </Link>
          </div>
        </div>
      )}

      {matchTarget && (
        <div className={styles.matchOverlay} role="dialog" aria-modal="true" onClick={() => setMatchTarget(null)}>
          <div className={styles.matchDialog} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.matchClose}
              onClick={() => setMatchTarget(null)}
              aria-label="Close"
            >
              ×
            </button>
            <p className={styles.matchTitle}>✦ Match</p>
            <p className={styles.matchText}>
              Meet <strong>{matchTarget.name}</strong> in a hangout room? Rooms open on your next visit to the lounge.
            </p>
            <div className={styles.matchButtons}>
              <button
                type="button"
                className={`${styles.tooltipAction} ${styles.tooltipActionPrimary}`}
                onClick={() => {
                  setMatchTarget(null);
                  router.push("/rooms");
                }}
              >
                Meet in a room
              </button>
              <button
                type="button"
                className={styles.tooltipAction}
                onClick={() => setMatchTarget(null)}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
