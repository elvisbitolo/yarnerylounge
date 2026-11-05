"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import styles from "../../admin/rooms/admin.module.css";

export default function HostRoomsPage() {
  const router = useRouter();
  const [isMovingIn, setIsMovingIn] = useState(false);
  const [scopeType, setScopeType] = useState(
    () => (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("audience") === "community"
        ? "community"
        : new URLSearchParams(window.location.search).get("scopeType") || "space"
      : "space")
  );
  const [scopeId, setScopeId] = useState(
    () => (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("scopeId") || ""
      : "")
  );
  const [hostScopes, setHostScopes] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(20);
  const [kind, setKind] = useState("standard");
  const [opensAt, setOpensAt] = useState("");
  const [publicPreview, setPublicPreview] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [scopesResponse, profileResponse] = await Promise.all([
      fetch("/api/host/scopes", { cache: "no-store" }),
      fetch("/api/me", { cache: "no-store" }),
    ]);
    if (scopesResponse.ok) {
      const data = await scopesResponse.json();
      setHostScopes(Array.isArray(data.scopes) ? data.scopes : []);
    }
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      const movingIn = String(profile.tier || profile.plan || "").toLowerCase() === "moving-in";
      setIsMovingIn(movingIn);
      if (movingIn && new URLSearchParams(window.location.search).get("audience") === "community") {
        setScopeType("community");
      }
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      load();
    });
    return unsub;
  }, [router, load]);

  const creatable = hostScopes.filter(
    (scope) => scope.scopeType === "space" || scope.scopeType === "group"
  );
  const scopeOptions = creatable.filter((scope) => scope.scopeType === scopeType);
  const hasSelectedScope = scopeType === "community" || !!scopeId;

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (!hasSelectedScope) {
      setError("Choose the space or group this lounge belongs to.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          maxParticipants: Number(maxParticipants),
          spaceId: scopeType === "space" ? scopeId : "",
          groupId: scopeType === "group" ? scopeId : "",
          kind,
          publicPreview,
          opensAt: opensAt ? new Date(opensAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create lounge");
        return;
      }
      router.push(`/rooms/${data.room.slug}`);
    } catch {
      setError("Something went wrong while creating the lounge. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Create a lounge</h1>
      <p className={styles.itemMeta}>
        Bring members together in a live video space. Moving In members can create a lounge for the whole community or for a group they host.
      </p>
      {error && <p className={styles.error} role="alert">{error}</p>}

      <form className={styles.form} onSubmit={handleCreate}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="audience">Who can join?</label>
          <select
            id="audience"
            className={styles.input}
            value={scopeType}
            onChange={(e) => {
              setScopeType(e.target.value);
              setScopeId("");
            }}
          >
            {isMovingIn && <option value="community">Entire community</option>}
            {creatable.some((scope) => scope.scopeType === "space") && <option value="space">A space I host</option>}
            {creatable.some((scope) => scope.scopeType === "group") && <option value="group">A group I host</option>}
          </select>
        </div>
        {scopeType !== "community" && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="scope">Choose your {scopeType}</label>
            <select
              id="scope"
              className={styles.input}
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              required
            >
              <option value="">Choose a {scopeType}…</option>
              {scopeOptions.map((scope) => (
                <option key={scope.scopeId} value={scope.scopeId}>{scope.name}</option>
              ))}
            </select>
            {scopeOptions.length === 0 && (
              <small className={styles.help}>You do not currently host a {scopeType}. Choose another audience or create a community-wide lounge if your plan allows it.</small>
            )}
          </div>
        )}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="name">Lounge name</label>
          <input id="name" className={styles.input} type="text" maxLength={120} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="description">Description</label>
          <textarea id="description" className={styles.textarea} rows={3} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="max">Maximum participants</label>
          <input id="max" className={styles.input} type="number" min={2} max={100} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="kind">Lounge format</label>
          <select id="kind" className={styles.input} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="standard">Open video chat — members can speak</option>
            <option value="broadcast">Broadcast — host speaks, members watch</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="opensAt">Schedule (optional)</label>
          <input id="opensAt" className={styles.input} type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Public preview</label>
          <label className={styles.checkCard}>
            <input type="checkbox" checked={publicPreview} onChange={(e) => setPublicPreview(e.target.checked)} />
            <span className={styles.checkText}><strong>Show on the public explore page</strong></span>
          </label>
        </div>
        <button className={styles.submit} type="submit" disabled={busy || !hasSelectedScope}>
          {busy ? "Creating…" : "Create lounge"}
        </button>
      </form>
    </div>
  );
}
