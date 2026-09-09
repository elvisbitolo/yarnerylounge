"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { roleBadgeLabel } from "@/lib/profile/roles";
import { countryNames } from "@/lib/profile/countries";
import { QUIZ_QUESTIONS, QUIZ_LABELS } from "@/lib/profile/questions";
import { composeLayout } from "./avatarLayout";
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

function distinct(list) {
  const s = new Set();
  for (const v of list) if (v) s.add(v);
  return [...s].sort();
}

function intersect(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  const set = new Set(b);
  return a.filter((v) => set.has(v));
}

function quizAnswerValue(member, field) {
  const value = member?.quiz?.[field];
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function commoStrings(viewer, member) {
  const found = [];
  if (!viewer || !member) return found;
  if (viewer.country && viewer.country === member.country) found.push(`Both in ${member.country}`);
  if (viewer.goToYarn && viewer.goToYarn === member.goToYarn) found.push(`Both love ${member.goToYarn}`);
  if (viewer.favoriteHookSize && viewer.favoriteHookSize === member.favoriteHookSize) found.push(`Both use a ${member.favoriteHookSize}`);
  if (Array.isArray(viewer.favoriteColors) && Array.isArray(member.favoriteColors)) {
    const overlap = viewer.favoriteColors.filter((c) => member.favoriteColors.includes(c));
    if (overlap.length) found.push(`${overlap.length} fav${overlap.length === 1 ? "orite color" : "orite colors"} in common`);
  }
  if (Array.isArray(viewer.crafts) && Array.isArray(member.crafts)) {
    const overlap = viewer.crafts.filter((c) => member.crafts.includes(c));
    if (overlap.length) found.push(`${overlap.length} shared craft${overlap.length === 1 ? "" : "s"}: ${overlap.map(craftLabel).join(", ")}`);
  }
  if (Array.isArray(viewer.hobbies) && Array.isArray(member.hobbies)) {
    const overlap = viewer.hobbies.filter((h) => member.hobbies.includes(h));
    if (overlap.length) found.push(`${overlap.length} shared hobby${overlap.length === 1 ? "" : "s"} in common`);
  }
  if (Array.isArray(viewer.crochetTechniques) && Array.isArray(member.crochetTechniques)) {
    const overlap = viewer.crochetTechniques.filter((t) => member.crochetTechniques.includes(t));
    if (overlap.length) found.push(`${overlap.length} shared technique${overlap.length === 1 ? "" : "s"}`);
  }
  for (const q of QUIZ_QUESTIONS) {
    const v = quizAnswerValue(viewer, q.field);
    const m = quizAnswerValue(member, q.field);
    if (v && m && v === m) found.push(`Both picked “${m}”`);
  }
  return found.slice(0, 6);
}

export default function MembersDirectory({ members, viewer, role, todayKey, matchmakerEnabled }) {
  const router = useRouter();
  const frameRef = useRef(null);

  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [craft, setCraft] = useState("");
  const [hobby, setHobby] = useState("");
  const [quizField, setQuizField] = useState("");
  const [quizValue, setQuizValue] = useState("");
  const [hover, setHover] = useState(null);
  const [matchTarget, setMatchTarget] = useState(null);
  const hideTimer = useRef(null);

  const countries = useMemo(() => {
    const all = countryNames();
    const inUse = distinct(members.map((m) => m.country));
    return [...all, ...inUse.filter((c) => !all.includes(c))];
  }, [members]);

  const locations = useMemo(() => distinct(members.map((m) => m.location)), [members]);

  const hobbiesInUse = useMemo(
    () => distinct(members.flatMap((m) => (Array.isArray(m.hobbies) ? m.hobbies : []))),
    [members]
  );

  const FIELD_OPTIONS = useMemo(() => {
    const options = [
      { value: "country", label: "Country" },
      { value: "location", label: "Location" },
      { value: "hobby", label: "Hobby" },
      { value: "craft", label: "Craft" },
    ];
    for (const q of QUIZ_QUESTIONS) {
      options.push({ value: `quiz:${q.field}`, label: QUIZ_LABELS[q.field] || q.question });
    }
    return options;
  }, []);

  const quizFieldOptions = useMemo(() => {
    if (!quizField || !quizField.startsWith("quiz:")) return [];
    const field = quizField.slice(5);
    const question = QUIZ_QUESTIONS.find((q) => q.field === field);
    if (!question) return [];
    return question.options.map((opt) => ({ value: opt, label: opt }));
  }, [quizField]);

  const hobbyOptions = useMemo(() => {
    const known = new Map(HOBBIES.map((h) => [h.value, h.label]));
    const used = hobbiesInUse.map((h) => ({ value: h, label: known.get(h) || h }));
    return used.sort((a, b) => a.label.localeCompare(b.label));
  }, [hobbiesInUse]);

  const query = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    const memberMatchesQuiz = (m) => {
      if (!quizField || !quizField.startsWith("quiz:")) return true;
      const field = quizField.slice(5);
      const value = m.quiz?.[field];
      if (Array.isArray(value)) return value.includes(quizValue);
      return String(value || "") === quizValue;
    };
    const pool = members.filter((member) => {
      if (tab === "lounge" && !member.live) return false;
      if (tab === "online" && member.lastVisitDate !== todayKey) return false;
      if (tab === "hosts" && member.role !== "owner" && member.role !== "moderator") return false;
      if (craft && !member.crafts?.includes(craft)) return false;
      if (country && member.country !== country) return false;
      if (location && member.location !== location) return false;
      if (hobby && !(Array.isArray(member.hobbies) && member.hobbies.includes(hobby))) return false;
      if (quizField && !memberMatchesQuiz(member)) return false;
      if (!query) return true;
      return (
        member.name?.toLowerCase().includes(query) ||
        member.headline?.toLowerCase().includes(query) ||
        member.location?.toLowerCase().includes(query) ||
        member.country?.toLowerCase().includes(query) ||
        member.bio?.toLowerCase().includes(query) ||
        (Array.isArray(member.hobbies) && member.hobbies.some((h) => h.toLowerCase().includes(query)))
      );
    });
    if (tab === "newest") return [...pool].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (tab === "top") return [...pool].sort((a, b) => (b.points || 0) - (a.points || 0));
    return [...pool].sort((a, b) => a.name.localeCompare(b.name));
  }, [members, tab, query, country, location, craft, hobby, quizField, quizValue, todayKey]);

  function showTooltip(member, e) {
    clearTimeout(hideTimer.current);
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ member, rect: r, common: commoStrings(viewer, member) });
  }

  function scheduleHide() {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), 1800);
  }

  const tooltipPos = useMemo(() => {
    if (!hover) return null;
    const vw = typeof window !== "undefined" ? window.innerWidth : 800;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    const cx = hover.rect.left + hover.rect.width / 2;
    const left = Math.max(8, Math.min(cx - 300 / 2, vw - 300 - 8));
    let top = hover.rect.bottom + 12;
    if (top + 360 > vh) top = Math.max(8, hover.rect.top - 360 - 12);
    return { left, top };
  }, [hover]);

  const placed = useMemo(
    () =>
      composeLayout(filtered, { width: PRESETS.desktop.width, height: PRESETS.desktop.height }),
    [filtered]
  );

  const memberById = useMemo(() => new Map(filtered.map((m) => [m.id, m])), [filtered]);

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
            <span className={styles.matchmakerSparkle}>✦</span> Find members by
          </p>
          <div className={styles.findByRow}>
            <select
              className={styles.findBySelect}
              value={quizField}
              onChange={(e) => {
                setQuizField(e.target.value);
                setQuizValue("");
                if (e.target.value === "country") setCountry("");
                if (e.target.value === "location") setLocation("");
                if (e.target.value === "hobby") setHobby("");
                if (e.target.value === "craft") setCraft("");
              }}
              aria-label="Find members by"
            >
              <option value="">Find members by…</option>
              {FIELD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {quizField === "country" && (
              <select
                className={styles.findBySelect}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-label="Filter by country"
              >
                <option value="">All countries</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            {quizField === "location" && (
              <select
                className={styles.findBySelect}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                aria-label="Filter by location"
              >
                <option value="">All locations</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            )}

            {quizField === "hobby" && (
              <select
                className={styles.findBySelect}
                value={hobby}
                onChange={(e) => setHobby(e.target.value)}
                aria-label="Filter by hobby"
              >
                <option value="">All hobbies</option>
                {HOBBIES.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            )}

            {quizField === "craft" && (
              <select
                className={styles.findBySelect}
                value={craft}
                onChange={(e) => setCraft(e.target.value)}
                aria-label="Filter by craft"
              >
                <option value="">All crafts</option>
                {CRAFTS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            )}

            {quizField.startsWith("quiz:") && quizField !== "quiz:" && (
              <select
                className={styles.findBySelect}
                value={quizValue}
                onChange={(e) => setQuizValue(e.target.value)}
                aria-label="Filter by answer"
              >
                <option value="">Any answer</option>
                {quizFieldOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}

            {(country || location || hobby || craft || quizField || quizValue) && (
              <button
                type="button"
                className={styles.findByClear}
                onClick={() => {
                  setCountry("");
                  setLocation("");
                  setHobby("");
                  setCraft("");
                  setQuizField("");
                  setQuizValue("");
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {query || tab !== "all" || country || location || craft || hobby || quizField || quizValue
            ? "No members match this view."
            : "No members yet."}
        </p>
      ) : (
        <div className={styles.canvasFrame} ref={frameRef} style={{ height: 560 }}>
          <span className={styles.canvasGlow} aria-hidden="true" />
          <div className={styles.canvasLayer}>
            {placed.map((slot) => {
              const member = memberById.get(slot.id);
              if (!member) return null;
              const ring = member.favoriteColors?.[0] || "#e91e63";
              return (
                <Link
                  key={member.id}
                  href={`/members/${member.id}?from=/members`}
                  className={styles.tile}
                  onMouseEnter={(e) => showTooltip(member, e)}
                  onMouseMove={(e) => {
                    scheduleHide();
                    const r = e.currentTarget.getBoundingClientRect();
                    setHover({ member, rect: r, common: commoStrings(viewer, member) });
                  }}
                  onMouseLeave={scheduleHide}
                  onFocus={(e) => showTooltip(member, e)}
                  onBlur={() => setHover(null)}
                  style={{ left: slot.x, top: slot.y }}
                >
                  <span className={styles.tileAvatar} style={{ borderColor: ring }} aria-hidden="true">
                    {(member.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className={styles.tileName}>{member.name}</span>
                  {member.location && <span className={styles.tileLocation}>{member.location}</span>}
                </Link>
              );
            })}
          </div>

          {tooltipPos && hover && (
            <div className={styles.tooltipAbsolute} style={{ left: tooltipPos.left, top: tooltipPos.top }} onClick={() => setHover(null)}>
              <div className={styles.tooltip} onClick={(e) => e.stopPropagation()}>
                <div className={styles.tooltipHeader}>
                  <span className={styles.tooltipAvatar} aria-hidden="true">
                    {(hover.member.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className={styles.tooltipHeaderText}>
                    <span className={styles.tooltipName}>{hover.member.name}</span>
                    {hover.member.country && (
                      <span className={styles.tooltipCountry}>
                        {countryNames.find((c) => c.code === hover.member.country)?.name || hover.member.country}
                      </span>
                    )}
                  </div>
                  {hover.member.role === "owner" && <span className={styles.tooltipOwnerBadge}>Owner</span>}
                </div>

                <div className={styles.tooltipBody}>
                  {hover.member.headline && <p className={styles.tooltipHeadline}>{hover.member.headline}</p>}
                  {hover.member.location && <p className={styles.tooltipLocation}>{hover.member.location}</p>}
                  {hover.member.bio && <p className={styles.tooltipBio}>{hover.member.bio}</p>}

                  {Array.isArray(hover.member.crafts) && hover.member.crafts.length > 0 && (
                    <p className={styles.tooltipField}>
                      <span className={styles.tooltipFieldLabel}>Crafts</span>
                      <span className={styles.tooltipFieldValue}>{hover.member.crafts.join(", ")}</span>
                    </p>
                  )}
                  {Array.isArray(hover.member.hobbies) && hover.member.hobbies.length > 0 && (
                    <p className={styles.tooltipField}>
                      <span className={styles.tooltipFieldLabel}>Hobbies</span>
                      <span className={styles.tooltipFieldValue}>{hover.member.hobbies.join(", ")}</span>
                    </p>
                  )}
                  {Array.isArray(hover.member.crochetTechniques) && hover.member.crochetTechniques.length > 0 && (
                    <p className={styles.tooltipField}>
                      <span className={styles.tooltipFieldLabel}>Techniques</span>
                      <span className={styles.tooltipFieldValue}>{hover.member.crochetTechniques.join(", ")}</span>
                    </p>
                  )}
                  {hover.member.goToYarn && (
                    <p className={styles.tooltipField}>
                      <span className={styles.tooltipFieldLabel}>I go to the yarn for</span>
                      <span className={styles.tooltipFieldValue}>{hover.member.goToYarn}</span>
                    </p>
                  )}
                  {hover.member.favoriteHookSize && (
                    <p className={styles.tooltipField}>
                      <span className={styles.tooltipFieldLabel}>My go-to hook</span>
                      <span className={styles.tooltipFieldValue}>{hover.member.favoriteHookSize}</span>
                    </p>
                  )}
                  {hover.member.yearsExperience && (
                    <p className={styles.tooltipField}>
                      <span className={styles.tooltipFieldLabel}>Years experience</span>
                      <span className={styles.tooltipFieldValue}>{hover.member.yearsExperience}</span>
                    </p>
                  )}
                  {hover.member.favoriteYarnBrand && (
                    <p className={styles.tooltipField}>
                      <span className={styles.tooltipFieldLabel}>Fave yarn brand</span>
                      <span className={styles.tooltipFieldValue}>{hover.member.favoriteYarnBrand}</span>
                    </p>
                  )}
                  {hover.member.learningNext && (
                    <p className={styles.tooltipField}>
                      <span className={styles.tooltipFieldLabel}>Learning next</span>
                      <span className={styles.tooltipFieldValue}>{hover.member.learningNext}</span>
                    </p>
                  )}
                  {hover.member.proudestProject && (
                    <p className={styles.tooltipField}>
                      <span className={styles.tooltipFieldLabel}>Proudest project</span>
                      <span className={styles.tooltipFieldValue}>{hover.member.proudestProject}</span>
                    </p>
                  )}
                  {hover.member.bestGiftProject && (
                    <p className={styles.tooltipField}>
                      <span className={styles.tooltipFieldLabel}>Best gift I ever made</span>
                      <span className={styles.tooltipFieldValue}>{hover.member.bestGiftProject}</span>
                    </p>
                  )}

                  {hover.common.length > 0 && (
                    <div className={styles.tooltipCommon}>
                      <p className={styles.tooltipCommonTitle}>In common with you</p>
                      <ul className={styles.tooltipCommonList}>
                        {hover.common.map((item, i) => (
                          <li key={i} className={styles.tooltipCommonItem}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className={styles.tooltipFooter}>
                  <Link className={styles.tooltipAction} href={`/chat?with=${hover.member.id}`} onClick={() => setHover(null)}>
                    💬 Message
                  </Link>
                  <Link className={`${styles.tooltipAction} ${styles.tooltipActionPrimary}`} href={`/members/${hover.member.id}?from=/members`} onClick={() => setHover(null)}>
                    View profile
                  </Link>
                  {hover.member.role === "owner" && (
                    <Link className={styles.tooltipAction} href="/admin/hosts?view=${hover.member.id}" onClick={() => setHover(null)}>
                      Manage as host
                    </Link>
                  )}
                  <button
                    type="button"
                    className={`${styles.tooltipAction} ${styles.tooltipActionMatch}`}
                    onClick={() => setMatchTarget(hover.member)}
                  >
                    ✦ Send interest
                  </button>
                </div>
              </div>
            </div>
          )}
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
