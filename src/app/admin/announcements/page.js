"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "../rooms/admin.module.css";

const AUDIENCES = [
  { value: "community", label: "Entire community", needsScope: false },
  { value: "space", label: "Space members", needsScope: true },
  { value: "group", label: "Group members", needsScope: true },
  { value: "room", label: "Room audience", needsScope: true },
];

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [audience, setAudience] = useState("community");
  const [scopeId, setScopeId] = useState("");
  const [scopeOptions, setScopeOptions] = useState({});
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadScopes = useCallback(async () => {
    const res = await fetch("/api/admin/host-assignments/scopes");
    if (res.ok) {
      const data = await res.json();
      setScopeOptions(data.scopes || {});
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/admin/announcements");
    if (res.ok) setHistory((await res.json()).announcements || []);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadScopes();
      loadHistory();
    });
    return unsub;
  }, [router, loadScopes, loadHistory]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  const needsScope = AUDIENCES.find((a) => a.value === audience)?.needsScope;
  const options = needsScope ? scopeOptions[audience] || [] : [];

  async function send(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (needsScope && !scopeId) {
      setError("Choose a target for this audience.");
      return;
    }
    if (!message.trim()) {
      setError("Write a message first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, scopeId: needsScope ? scopeId : "", message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSuccess(
        `Announcement sent to ${data.sentCount} member${data.sentCount === 1 ? "" : "s"}.`
      );
      setMessage("");
      setScopeId("");
      await loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Announcements</h1>
        <p className={styles.itemMeta}>
          Send a one-time message to the whole community or to the members of a
          specific space, group, or room.
        </p>
        {error && <p className={styles.error}>{error}</p>}
        {success && <p className={styles.success}>{success}</p>}

        <form className={styles.form} onSubmit={send}>
          <div className={styles.fieldRow}>
            <select
              className={styles.input}
              style={{ width: 220, height: 40, padding: "0 8px" }}
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value);
                setScopeId("");
              }}
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            {needsScope && (
              <select
                className={styles.input}
                style={{ flex: 1, height: 40, padding: "0 8px" }}
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
              >
                <option value="">Choose a {audience}…</option>
                {options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <textarea
            className={styles.input}
            style={{ minHeight: 120, padding: "10px 12px", fontFamily: "inherit" }}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your announcement…"
          />
          <div className={styles.fieldRow}>
            <button className={styles.submit} disabled={busy}>
              {busy ? "Sending…" : "Send announcement"}
            </button>
            <span className={styles.itemMeta}>{message.length}/2000</span>
          </div>
        </form>

        <h2 className={styles.listTitle}>Recent announcements</h2>
        {history.length === 0 ? (
          <p className={styles.empty}>No announcements sent yet.</p>
        ) : (
          <div className={styles.list}>
            {history.map((a) => (
              <div key={a.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>{a.message}</p>
                  <p className={styles.itemMeta}>
                    {a.scopeType} · {a.sentCount} recipients ·{" "}
                    {new Date(a.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Nav>
  );
}
