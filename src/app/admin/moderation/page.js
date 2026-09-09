"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "../rooms/admin.module.css";

function timeAgo(ts) {
  if (!ts) return "";
  const millis = typeof ts.toMillis === "function" ? ts.toMillis() : Number(ts);
  const seconds = Math.floor((Date.now() - millis) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(millis).toLocaleDateString([], { month: "short", day: "numeric" });
}

const TYPE_LABELS = { post: "Post", comment: "Comment", member: "Member" };

export default function AdminModerationPage() {
  const router = useRouter();
  const [reports, setReports] = useState([]);
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    const res = await fetch("/api/admin/reports");
    if (res.ok) setReports((await res.json()).reports);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadReports();
    });
    return unsub;
  }, [router, loadReports]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  async function handleAction(id, action) {
    setError("");
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Action failed");
      return;
    }
    await loadReports();
  }

  return (
      <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Moderation</h1>
        {error && <p className={styles.error}>{error}</p>}

        <h2 className={styles.listTitle}>Open reports</h2>
        {reports.length === 0 ? (
          <p className={styles.empty}>No open reports. All clear.</p>
        ) : (
          <div className={styles.list}>
            {reports.map((report) => (
              <div key={report.id} className={styles.item} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <p className={styles.itemName}>
                    {TYPE_LABELS[report.type]} report · {report.reporterName}
                    <span style={{ color: "#9b9bab", fontWeight: 500 }}> · {timeAgo(report.createdAt)}</span>
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className={styles.submit} style={{ height: 34, padding: "0 14px", fontSize: 13 }} onClick={() => handleAction(report.id, "dismiss")}>
                      Dismiss
                    </button>
                    <button className={styles.delete} onClick={() => handleAction(report.id, "delete")}>
                      Delete content
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#6b6b7b", margin: 0 }}>{report.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>
</Nav>
  );
}
