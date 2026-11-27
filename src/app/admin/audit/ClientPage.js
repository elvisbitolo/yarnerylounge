"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import { billingFollowUpRows } from "@/lib/billing-follow-up";
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
  const [pendingEntries, setPendingEntries] = useState([]);
  const [billingOnly, setBillingOnly] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const load = useCallback(async (q) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    try {
      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Failed to load (${res.status})`);
      setEntries(data.entries || []);
      setPendingEntries(data.pendingBilling || []);
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

  const billingRows = billingFollowUpRows(pendingEntries);

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
            <span className={styles.count}>
              {loading
                ? "Loading…"
                : billingOnly
                  ? `${billingRows.length} pending billing request${billingRows.length === 1 ? "" : "s"}`
                  : `${entries.length} entries`}
            </span>
          </div>

          <div className={styles.chips} role="group" aria-label="Audit log filter">
            <button
              type="button"
              className={`${styles.chip} ${billingOnly ? "" : styles.chipOn}`}
              aria-pressed={!billingOnly}
              onClick={() => setBillingOnly(false)}
            >
              All audit entries
            </button>
            <button
              type="button"
              className={`${styles.chip} ${billingOnly ? styles.chipOn : ""}`}
              aria-pressed={billingOnly}
              onClick={() => setBillingOnly(true)}
            >
              Pending billing follow-up ({billingRows.length})
            </button>
          </div>
          {billingOnly ? (
            <p className={styles.sub}>
              Shopify billing requests awaiting owner action. Local membership access already changed.
            </p>
          ) : null}

          {error ? <div className={styles.error}>{error}</div> : null}

          {(billingOnly ? billingRows.length : entries.length) === 0 && !loading ? (
            <div className={styles.empty}>
              {billingOnly ? "No pending billing requests." : "Nothing recorded yet."}
            </div>
          ) : billingOnly ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>When</th>
                      <th className={styles.th}>Action</th>
                      <th className={styles.th}>Requested action</th>
                      <th className={styles.th}>Target member</th>
                      <th className={styles.th}>Plan</th>
                      <th className={styles.th}>Shopify order</th>
                      <th className={styles.th}>Shopify customer</th>
                      <th className={styles.th}>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingRows.map((r) => (
                      <tr key={r.id} className={styles.tr}>
                        <td className={styles.td}>
                          <span className={styles.status}>{stamp(r.createdAt)}</span>
                        </td>
                        <td className={styles.td}><span className={styles.action}>{r.action || "—"}</span></td>
                        <td className={styles.td}><span className={styles.action}>{r.requestedAction || "—"}</span></td>
                        <td className={styles.td}>
                          <span className={styles.rowTitle}>{r.member}</span>
                          {r.memberId ? <div className={styles.rowSub}>{r.memberId}</div> : null}
                        </td>
                        <td className={styles.td}>
                          <span className={styles.rowTitle}>{r.plan || "—"}</span>
                          {r.previousTier ? <div className={styles.rowSub}>from {r.previousTier}</div> : null}
                        </td>
                        <td className={styles.td}><span className={styles.meta}>{r.shopifyOrderId || "—"}</span></td>
                        <td className={styles.td}><span className={styles.meta}>{r.shopifyCustomerId || "—"}</span></td>
                        <td className={styles.td}><span className={styles.meta}>{r.email || "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.mobileEntries}>
                {billingRows.map((r) => (
                  <article key={r.id} className={styles.entryCard}>
                    <div className={styles.entryTop}>
                      <div className={styles.actor}>
                        <span className={styles.avatar} aria-hidden="true">{actorInitials(r.member, r.email)}</span>
                        <div className={styles.actorText}>
                          <span className={styles.rowTitle}>{r.member}</span>
                          {r.memberId ? <span className={styles.rowSub}>{r.memberId}</span> : null}
                        </div>
                      </div>
                      <time className={styles.relativeTime} dateTime={r.createdAt || undefined} title={stamp(r.createdAt)}>
                        {relativeStamp(r.createdAt)}
                      </time>
                    </div>
                    <div className={styles.entryAction}>
                      <span className={styles.action}>{r.requestedAction || "Billing request"}</span>
                    </div>
                    <div className={styles.entryFields}>
                      <div className={styles.entryField}>
                        <span className={styles.fieldLabel}>Audit action</span>
                        <span className={styles.fieldValue}>{r.action || "—"}</span>
                      </div>
                      <div className={styles.entryField}>
                        <span className={styles.fieldLabel}>Plan</span>
                        <span className={styles.fieldValue}>{r.plan || "—"}</span>
                      </div>
                      {r.previousTier ? (
                        <div className={styles.entryField}>
                          <span className={styles.fieldLabel}>Previous plan</span>
                          <span className={styles.fieldValue}>{r.previousTier}</span>
                        </div>
                      ) : null}
                      <div className={styles.entryField}>
                        <span className={styles.fieldLabel}>Shopify order</span>
                        <span className={styles.fieldValue}>{r.shopifyOrderId || "—"}</span>
                      </div>
                      <div className={styles.entryField}>
                        <span className={styles.fieldLabel}>Shopify customer</span>
                        <span className={styles.fieldValue}>{r.shopifyCustomerId || "—"}</span>
                      </div>
                      <div className={styles.entryField}>
                        <span className={styles.fieldLabel}>Email</span>
                        <span className={styles.fieldValue}>{r.email || "—"}</span>
                      </div>
                    </div>
                    <div className={styles.exactTime}>{stamp(r.createdAt)}</div>
                  </article>
                ))}
              </div>
            </>
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
