"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
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
    <Nav role={role}>
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
                    <td className={styles.td}>
                      <span className={styles.action}>{e.action}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.status}>{e.targetId ? `${e.targetId.slice(0, 12)}…` : "—"}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.meta}>{describe(e.metadata)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Nav>
  );
}
