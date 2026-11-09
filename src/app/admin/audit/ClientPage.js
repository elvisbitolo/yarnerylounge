"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import styles from "./audit.module.css";

function stamp(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeStamp(iso) {
  if (!iso) return "Date unavailable";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  if (Math.abs(seconds) < 45) return "Just now";
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) || ["minute", 60];
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(seconds / size), unit);
}

function actorInitials(name, email) {
  const source = (name || email || "Admin").trim();
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "A";
}

function describe(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  const parts = Object.entries(metadata).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`);
  return parts.join("  ");
}

export default function AdminAuditPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const load = useCallback(async (q) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    try {
      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const data = await res.json();
      setEntries(data.entries || []);
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
      load(query);
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
    timer.current = setTimeout(() => load(value), 250);
  };

  return (
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Audit log</h1>
          <p className={styles.sub}>
            Every admin write, recorded with who did it and what changed. Owner only — the trail exposes actor ids.
          </p>

          <div className={styles.searchRow}>
            <input
              className={styles.input}
              placeholder="Filter by action, person or target id…"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
            />
            <span className={styles.count}>{loading ? "Loading…" : `${entries.length} entries`}</span>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}

          {entries.length === 0 && !loading ? (
            <div className={styles.empty}>Nothing recorded yet.</div>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>When</th>
                      <th className={styles.th}>Who</th>
                      <th className={styles.th}>Action</th>
                      <th className={styles.th}>Target</th>
                      <th className={styles.th}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className={styles.tr}>
                        <td className={styles.td}>
                          <span className={styles.status}>{stamp(e.createdAt)}</span>
                        </td>
                        <td className={styles.td}>
                          <span className={styles.rowTitle}>{e.actorName || "—"}</span>
                          {e.actorEmail ? <div className={styles.rowSub}>{e.actorEmail}</div> : null}
                        </td>
                        <td className={styles.td}><span className={styles.action}>{e.action}</span></td>
                        <td className={styles.td}>
                          <span className={styles.status}>{e.targetId ? `${e.targetId.slice(0, 12)}…` : "—"}</span>
                        </td>
                        <td className={styles.td}><span className={styles.meta}>{describe(e.metadata)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.mobileEntries}>
                {entries.map((e) => (
                  <article key={e.id} className={styles.entryCard}>
                    <div className={styles.entryTop}>
                      <div className={styles.actor}>
                        <span className={styles.avatar} aria-hidden="true">{actorInitials(e.actorName, e.actorEmail)}</span>
                        <div className={styles.actorText}>
                          <span className={styles.rowTitle}>{e.actorName || "Unknown actor"}</span>
                          {e.actorEmail ? <span className={styles.rowSub}>{e.actorEmail}</span> : null}
                        </div>
                      </div>
                      <time className={styles.relativeTime} dateTime={e.createdAt || undefined} title={stamp(e.createdAt)}>
                        {relativeStamp(e.createdAt)}
                      </time>
                    </div>
                    <div className={styles.entryAction}><span className={styles.action}>{e.action || "Unknown action"}</span></div>
                    <div className={styles.entryFields}>
                      <div className={styles.entryField}>
                        <span className={styles.fieldLabel}>Target</span>
                        <span className={styles.fieldValue}>{e.targetId || "—"}</span>
                      </div>
                      {e.metadata && Object.keys(e.metadata).length > 0 ? (
                        <div className={styles.entryField}>
                          <span className={styles.fieldLabel}>Details</span>
                          <span className={styles.fieldValue}>{describe(e.metadata)}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className={styles.exactTime}>{stamp(e.createdAt)}</div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
  );
}
