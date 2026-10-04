"use client";

import { useEffect, useState } from "react";
import styles from "./developer.module.css";

const SCOPES = [
  { key: "read:profile", label: "Profile", desc: "View your public profile" },
  { key: "read:members", label: "Members", desc: "List and view public members" },
  { key: "read:posts", label: "Posts", desc: "Read public and your own posts" },
  { key: "read:events", label: "Events", desc: "Read public upcoming events" },
];

const EXPIRES_OPTIONS = [
  { value: "", label: "No expiration" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

function maskToken(token) {
  if (!token || token.length < 24) return token || "";
  const head = token.slice(0, 12);
  const tail = token.slice(-8);
  return `${head}…${tail}`;
}

export default function DeveloperPage() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("My app");
  const [expires, setExpires] = useState("");
  const [scopes, setScopes] = useState(() => new Set(SCOPES.map((s) => s.key)));
  const [newToken, setNewToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/developer/tokens");
      const json = res.ok ? await res.json() : { tokens: [] };
      setTokens(json.tokens || []);
    } catch {
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/developer/tokens");
        const json = res.ok ? await res.json() : { tokens: [] };
        if (active) setTokens(json.tokens || []);
      } catch {
        if (active) setTokens([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  function toggleScope(key) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function create() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/developer/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scopes: Array.from(scopes),
          expiresInDays: expires ? Number(expires) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to create token");
        return;
      }
      setNewToken(json.token);
      setName("My app");
      await load();
    } catch {
      setError("Failed to create token");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id) {
    await fetch(`/api/developer/tokens/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  async function copy() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Developer</h1>
        <p className={styles.subtitle}>Personal access tokens for the public API</p>
      </header>

      {newToken && (
        <div className={styles.flash}>
          <h2>Copy your token</h2>
          <p>This token is shown once and cannot be recovered later.</p>
          <div className={styles.tokenBox}>
            <code>{newToken}</code>
            <button className={styles.primaryBtn} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <button className={`${styles.ghost} ${styles.primaryBtn}`} onClick={() => setNewToken(null)}>Done</button>
        </div>
      )}

      <section className={styles.card}>
        <h2>New token</h2>
        <div className={styles.field}>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <div className={styles.field}>
          <label>Expiration</label>
          <select value={expires} onChange={(e) => setExpires(e.target.value)}>
            {EXPIRES_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Scopes</label>
          <div className={styles.scopes}>
            {SCOPES.map((s) => (
              <label key={s.key} className={styles.scope}>
                <input
                  type="checkbox"
                  checked={scopes.has(s.key)}
                  onChange={() => toggleScope(s.key)}
                />
                <div>
                  <strong>{s.label}</strong>
                  <small>{s.desc}</small>
                </div>
              </label>
            ))}
          </div>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.primaryBtn} onClick={create} disabled={creating || scopes.size === 0}>
          {creating ? "Creating…" : "Create token"}
        </button>
        <p className={styles.note}>
          Tokens are Bearer tokens for <code>https://{process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") || "yarnerylounge.com"}/api/v1</code>.
        </p>
      </section>

      <section className={styles.card}>
        <h2>Your tokens</h2>
        {loading ? (
          <p>Loading…</p>
        ) : tokens.length === 0 ? (
          <p>No tokens yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Scopes</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Last used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td><code>{t.prefix}</code></td>
                  <td>{(t.scopes || []).join(", ")}</td>
                  <td>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}</td>
                  <td>{t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : "Never"}</td>
                  <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleDateString() : "Never"}</td>
                  <td>
                    <button onClick={() => revoke(t.id)} className={`${styles.danger} ${styles.primaryBtn}`}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.card}>
        <h2>Docs</h2>
        <p>
          See the <a href="/developer/docs">API reference</a> for curl examples and pagination.
        </p>
      </section>
    </div>
  );
}
