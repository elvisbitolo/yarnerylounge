"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "./content.module.css";

const KINDS = ["member", "post", "article", "room", "space", "group", "event", "course", "recording"];

// Kinds that now have a staff editor, and the screen that hosts it. The index
// previously linked only to the member-facing page, so staff could find a row
// but had no route to fixing it. member/post/course/recording have no editor
// yet and are deliberately absent rather than linked to a dead end.
const EDIT_SCREENS = {
  article: "/admin/articles",
  room: "/admin/rooms",
  space: "/admin/spaces",
  group: "/admin/groups",
  event: "/admin/events",
};

const KIND_LABELS = {
  member: "Member",
  post: "Post",
  article: "Article",
  room: "Lounge",
  space: "Space",
  group: "Group",
  event: "Event",
  course: "Course",
  recording: "Recording",
};

function when(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function kindClass(kind) {
  if (kind === "member") return styles.kindMember;
  if (kind === "article") return styles.kindArticle;
  if (kind === "recording") return styles.kindRecording;
  if (kind === "event") return styles.kindEvent;
  return "";
}

export default function AdminContentPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const load = useCallback(async (q, k) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q && q.trim().length >= 2) params.set("q", q.trim());
    if (k) params.set("kind", k);
    try {
      const res = await fetch(`/api/admin/content?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      setData(await res.json());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      load(query, kind);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, router]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => d && setRole(d.role));
  }, []);

  const onQuery = (value) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(value, kind), 250);
  };

  const onKind = (value) => {
    setKind(value);
    load(query, value);
  };

  const rows = data?.rows || [];

  return (
    <Nav role={role}>
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>All content</h1>
          <p className={styles.sub}>
            Every content type on the site in one index. Search across all of them at once, or filter to one.
          </p>

          <div className={styles.searchRow}>
            <input
              className={styles.input}
              placeholder="Search members, posts, articles, lounges, events…"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
            />
            <span className={styles.count}>
              {loading ? "Searching…" : `${rows.length}${data?.truncated ? "+" : ""} result${rows.length === 1 ? "" : "s"}`}
            </span>
          </div>

          <div className={styles.chips}>
            <span className={`${styles.chip} ${kind === "" ? styles.chipOn : ""}`} onClick={() => onKind("")}>
              All types
            </span>
            {KINDS.map((k) => (
              <span key={k} className={`${styles.chip} ${kind === k ? styles.chipOn : ""}`} onClick={() => onKind(k)}>
                {KIND_LABELS[k]}
              </span>
            ))}
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}

          {rows.length === 0 && !loading ? (
            <div className={styles.empty}>
              {query.trim().length === 1
                ? "Type at least two characters to search."
                : `Nothing matches “${query.trim()}”.`}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Type</th>
                  <th className={styles.th}>Title</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>When</th>
                  <th className={styles.th}>Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.kind}-${row.id}`} className={styles.tr}>
                    <td className={styles.td}>
                      <span className={`${styles.kind} ${kindClass(row.kind)}`}>{KIND_LABELS[row.kind]}</span>
                    </td>
                    <td className={styles.td}>
                      <Link className={styles.rowTitle} href={row.href}>
                        {row.title}
                      </Link>
                      {row.subtitle ? <div className={styles.rowSub}>{row.subtitle}</div> : null}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.status}>{row.status}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.status}>{when(row.updatedAt)}</span>
                    </td>
                    <td className={styles.td}>
                      {EDIT_SCREENS[row.kind] ? (
                        <Link className={styles.editLink} href={EDIT_SCREENS[row.kind]}>
                          Edit
                        </Link>
                      ) : (
                        <span className={styles.status}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}

          {data?.truncated ? (
            <div className={styles.trunc}>
              Showing the most recent matches only. Narrow the search or pick a single type to see more.
            </div>
          ) : null}
        </div>
      </div>
    </Nav>
  );
}
