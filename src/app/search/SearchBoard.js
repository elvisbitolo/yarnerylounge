"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./search.module.css";
import { Heart } from "lucide-react";

const TYPE_TABS = [
  { key: "", label: "All" },
  { key: "posts", label: "Posts" },
  { key: "members", label: "Members" },
  { key: "spaces", label: "Spaces" },
  { key: "courses", label: "Courses" },
  { key: "events", label: "Events" },
];

function timeAgo(millis) {
  if (!millis) return "";
  const seconds = Math.floor((Date.now() - millis) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(millis).toLocaleDateString([], { month: "short", day: "numeric" });
}

function relevance(score) {
  if (!score) return null;
  const level =
    score >= 80 ? "excellent" : score >= 60 ? "strong" : score >= 40 ? "good" : "weak";
  return { level, score };
}

function Section({ title, count, children, type }) {
  if (count === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {title} <span className={styles.sectionCount}>{count}</span>
      </h2>
      <div className={styles.cardList}>{children}</div>
    </section>
  );
}

export default function SearchBoard({ initialQ, initialHashtag, initialType, initialSpaceId, initialResults }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ || "");
  const [type, setType] = useState(initialType || "");
  const [busy, setBusy] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const results = initialResults;
  const hashtagMode = !!initialHashtag;

  useEffect(() => {
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const term = q.trim();
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (cancelled) return;
      if (term.length < 2) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      try {
        const res = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSuggestions(data.suggestions || []);
        setOpen(true);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  function submit(e) {
    e.preventDefault();
    const term = q.trim();
    if (!term || busy) return;
    setBusy(true);
    const params = new URLSearchParams({ q: term });
    if (type) params.set("type", type);
    router.push(`/search?${params.toString()}`);
  }

  function pickType(key) {
    setType(key);
    if (!q.trim()) return;
    const term = q.trim();
    const params = new URLSearchParams({ q: term });
    if (key) params.set("type", key);
    if (initialSpaceId) params.set("spaceId", initialSpaceId);
    router.push(`/search?${params.toString()}`);
  }

  function goToSuggestion(s) {
    setOpen(false);
    const url =
      s.type === "member"
        ? `/members/${s.id}`
        : s.type === "space"
        ? `/spaces/${s.slug || s.id}`
        : s.type === "course"
        ? `/courses/${s.id}`
        : `/events/${s.id}`;
    router.push(url);
  }

  const total = results
    ? results.posts.length +
      results.members.length +
      results.groups.length +
      results.spaces.length +
      results.courses.length +
      results.events.length +
      results.rooms.length
    : 0;

  return (
    <div>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.searchBox} ref={boxRef}>
          <input
            className={styles.input}
            type="search"
            placeholder="Search the community…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => q.trim().length >= 2 && setOpen(true)}
          />
          {open && suggestions.length > 0 && (
            <div className={styles.dropdown}>
              {suggestions.map((s) => (
                <button
                  key={`${s.type}-${s.id}`}
                  type="button"
                  className={styles.dropdownItem}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    goToSuggestion(s);
                  }}
                >
                  <span className={`${styles.dropdownType} ${styles[`type_${s.type}`]}`}>
                    {s.type}
                  </span>
                  <span className={styles.dropdownLabel}>
                    {s.label}
                    {s.subtitle && <span className={styles.dropdownSub}>{s.subtitle}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={styles.button} type="submit" disabled={!q.trim() || busy}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {!hashtagMode && q.trim() && (
        <div className={styles.tabs}>
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.key || "all"}
              type="button"
              className={type === tab.key ? styles.filterTabActive : styles.filterTab}
              onClick={() => pickType(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {hashtagMode && initialHashtag && (
        <p className={styles.hashtagBanner}>Showing posts tagged #{initialHashtag}</p>
      )}

      {(q || hashtag) && total > 0 && !hashtagMode && (
        <p className={styles.resultBanner}>
          Showing results for: <strong>{q}</strong>
          {type && <span className={styles.resultBannerType}> · {type}</span>}
        </p>
      )}

      {!results ? (
        <p className={styles.empty}>Search across the whole community — try a name or topic.</p>
      ) : total === 0 ? (
        <p className={styles.empty}>No results found.</p>
      ) : (
        <div className={styles.results}>
          <Section title="Posts" count={results.posts.length}>
            {results.posts.map((post) => (
              <article key={post.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.typeBadge}>Post</span>
                  {relevance(post._score) && (
                    <span
                      className={`${styles.relevance} ${styles[`relevance_${relevance(post._score).level}`]}`}
                      title={`Relevance ${relevance(post._score).score}/100`}
                    >
                      {relevance(post._score).level}
                    </span>
                  )}
                </div>
                <p className={styles.cardTitle}>
                  {post.text.slice(0, 120) || "Untitled post"}
                  {post.kind === "poll" && <span className={styles.kindBadge}>Poll</span>}
                </p>
                <p className={styles.cardMeta}>
                  by {post.authorName} · {timeAgo(post.createdAt)} · <Heart size={12} /> {post.likeCount}
                </p>
                {post.hashtags.length > 0 && (
                  <p className={styles.tags}>
                    {post.hashtags.map((tag) => (
                      <Link
                        key={tag}
                        className={styles.tag}
                        href={`/search?hashtag=${encodeURIComponent(tag)}`}
                      >
                        #{tag}
                      </Link>
                    ))}
                  </p>
                )}
                <p className={styles.cardActions}>
                  <Link className={styles.cardLink} href="/feed">View in feed</Link>
                </p>
              </article>
            ))}
          </Section>

          <Section title="Members" count={results.members.length}>
            {results.members.map((member) => (
              <Link key={member.id} href={`/members/${member.id}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.typeBadge}>Member</span>
                  {relevance(member._score) && (
                    <span className={`${styles.relevance} ${styles[`relevance_${relevance(member._score).level}`]}`}>
                      {relevance(member._score).level}
                    </span>
                  )}
                </div>
                <p className={styles.cardTitle}>{member.name}</p>
                <p className={styles.cardMeta}>{member.role}</p>
              </Link>
            ))}
          </Section>

          <Section title="Spaces" count={results.spaces.length}>
            {results.spaces.map((space) => (
              <Link key={space.id} href={`/spaces/${space.slug}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.typeBadge}>Space</span>
                  {relevance(space._score) && (
                    <span className={`${styles.relevance} ${styles[`relevance_${relevance(space._score).level}`]}`}>
                      {relevance(space._score).level}
                    </span>
                  )}
                </div>
                <p className={styles.cardTitle}>{space.name}</p>
                {space.description && <p className={styles.cardMeta}>{space.description}</p>}
                <p className={styles.cardMeta}>{space.memberCount} members</p>
              </Link>
            ))}
          </Section>

          <Section title="Groups" count={results.groups.length}>
            {results.groups.map((group) => (
              <Link key={group.id} href={`/groups/${group.slug}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.typeBadge}>Group</span>
                  {relevance(group._score) && (
                    <span className={`${styles.relevance} ${styles[`relevance_${relevance(group._score).level}`]}`}>
                      {relevance(group._score).level}
                    </span>
                  )}
                </div>
                <p className={styles.cardTitle}>{group.name}</p>
                {group.description && <p className={styles.cardMeta}>{group.description}</p>}
              </Link>
            ))}
          </Section>

          <Section title="Courses" count={results.courses.length}>
            {results.courses.map((course) => (
              <Link key={course.id} href={`/courses/${course.id}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.typeBadge}>Course</span>
                  {relevance(course._score) && (
                    <span className={`${styles.relevance} ${styles[`relevance_${relevance(course._score).level}`]}`}>
                      {relevance(course._score).level}
                    </span>
                  )}
                </div>
                <p className={styles.cardTitle}>{course.title}</p>
                {course.description && <p className={styles.cardMeta}>{course.description}</p>}
              </Link>
            ))}
          </Section>

          <Section title="Events" count={results.events.length}>
            {results.events.map((event) => (
              <Link key={event.id} href={`/events/${event.id}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.typeBadge}>Event</span>
                  {relevance(event._score) && (
                    <span className={`${styles.relevance} ${styles[`relevance_${relevance(event._score).level}`]}`}>
                      {relevance(event._score).level}
                    </span>
                  )}
                </div>
                <p className={styles.cardTitle}>{event.title}</p>
                <p className={styles.cardMeta}>
                  {new Date(event.startTime).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </Link>
            ))}
          </Section>

          <Section title="Live rooms" count={results.rooms.length}>
            {results.rooms.map((room) => (
              <Link key={room.id} href={`/rooms/${room.slug}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.typeBadge}>Room</span>
                  {relevance(room._score) && (
                    <span className={`${styles.relevance} ${styles[`relevance_${relevance(room._score).level}`]}`}>
                      {relevance(room._score).level}
                    </span>
                  )}
                </div>
                <p className={styles.cardTitle}>{room.name}</p>
                {room.description && <p className={styles.cardMeta}>{room.description}</p>}
              </Link>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
