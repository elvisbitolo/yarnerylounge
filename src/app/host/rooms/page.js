"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "../../admin/rooms/admin.module.css";

export default function HostRoomsPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [scopeType, setScopeType] = useState(
    () => (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("scopeType") || "space"
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
    const res = await fetch("/api/host/scopes");
    if (res.ok) setHostScopes((await res.json()).scopes || []);
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

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  const creatable = hostScopes.filter(
    (s) => s.scopeType === "space" || s.scopeType === "group"
  );
  const scopeOptions = creatable.filter((s) => s.scopeType === scopeType);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (!scopeId) {
      setError("Choose the space or group this room belongs to.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        maxParticipants,
        spaceId: scopeType === "space" ? scopeId : "",
        groupId: scopeType === "group" ? scopeId : "",
        kind,
        publicPreview,
        opensAt: opensAt ? new Date(opensAt).toISOString() : null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to create room");
      return;
    }
    router.push(`/rooms/${data.room.slug}`);
  }

  return (
    <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Create a room</h1>
        <p className={styles.itemMeta}>
          Rooms you create belong to a space or group you host. Members of that
          audience can join.
        </p>
        {error && <p className={styles.error}>{error}</p>}

        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.field}>
            <label className={styles.label}>Audience</label>
            <select
              className={styles.input}
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value);
                setScopeId("");
              }}
            >
              {creatable.some((s) => s.scopeType === "space") && <option value="space">A space I host</option>}
              {creatable.some((s) => s.scopeType === "group") && <option value="group">A group I host</option>}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Which {scopeType}?</label>
            <select
              className={styles.input}
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
            >
              <option value="">Choose a {scopeType}…</option>
              {scopeOptions.map((s) => (
                <option key={s.scopeId} value={s.scopeId}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">Room name</label>
            <input
              id="name"
              className={styles.input}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="description">Description</label>
            <textarea
              id="description"
              className={styles.textarea}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="max">Max participants</label>
            <input
              id="max"
              className={styles.input}
              type="number"
              min={2}
              max={100}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="kind">Room type</label>
            <select
              id="kind"
              className={styles.input}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="standard">Video chat (everyone speaks)</option>
              <option value="broadcast">Broadcast (host speaks, members watch)</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="opensAt">Schedule (optional)</label>
            <input
              id="opensAt"
              className={styles.input}
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Public preview</label>
            <label className={styles.checkCard}>
              <input
                type="checkbox"
                checked={publicPreview}
                onChange={(e) => setPublicPreview(e.target.checked)}
              />
              <span className={styles.checkText}>
                <strong>Show on the public explore page</strong>
              </span>
            </label>
          </div>
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create room"}
          </button>
        </form>
      </div>
    </Nav>
  );
}
