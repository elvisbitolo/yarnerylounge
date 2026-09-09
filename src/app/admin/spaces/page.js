"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "../rooms/admin.module.css";

const FEATURES = [
  { key: "feed", label: "Feed", description: "Posts, polls and questions" },
  { key: "chat", label: "Chat", description: "Space-wide chat room" },
  { key: "members", label: "Members", description: "Member directory for the space" },
  { key: "events", label: "Events", description: "Events scoped to the space" },
  { key: "courses", label: "Courses", description: "Courses scoped to the space" },
  { key: "live", label: "Live", description: "Live video rooms scoped to the space" },
];

const DEFAULT_FEATURES = { feed: true, chat: true, members: true, events: false, courses: false, live: false };

export default function AdminSpacesPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [access, setAccess] = useState("public");
  const [requiredTier, setRequiredTier] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [publicPreview, setPublicPreview] = useState(false);
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [spaces, setSpaces] = useState([]);
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSpaces = useCallback(async () => {
    const res = await fetch("/api/spaces?admin=1");
    if (res.ok) setSpaces((await res.json()).spaces);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadSpaces();
    });
    return unsub;
  }, [router, loadSpaces]);

  function toggleFeature(key) {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, access, requiredTier, features, purchasePriceCents: purchasePrice ? Math.round(Number(purchasePrice) * 100) : 0, publicPreview }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to create space");
      return;
    }
    setName("");
    setDescription("");
    setAccess("public");
    setRequiredTier("");
    setPurchasePrice("");
    setPublicPreview(false);
    setFeatures(DEFAULT_FEATURES);
    await loadSpaces();
  }

  async function handleDelete(id) {
    await fetch(`/api/spaces/${id}`, { method: "DELETE" });
    await loadSpaces();
  }

  async function handleTogglePreview(id, value) {
    await fetch(`/api/spaces/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicPreview: value }),
    });
    await loadSpaces();
  }

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  const accessLabel = {
    public: "Public",
    private: "Private",
    invite: "Invite only",
  };

  return (
      <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Manage spaces</h1>

        <form className={styles.form} onSubmit={handleCreate}>
          <h2 className={styles.formTitle}>Create a space</h2>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">Space name</label>
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
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="access">Who can join</label>
              <select
                id="access"
                className={styles.input}
                value={access}
                onChange={(e) => setAccess(e.target.value)}
              >
                <option value="public">Public — anyone can join</option>
                <option value="private">Private — members can join</option>
                <option value="invite">Invite only — host adds members</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="tier">Membership tier (optional)</label>
              <select
                id="tier"
                className={styles.input}
                value={requiredTier}
                onChange={(e) => setRequiredTier(e.target.value)}
              >
                <option value="">Any active member</option>
                <option value="premium">Yarnery Hosts only</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="purchasePrice">One-time price (optional)</label>
              <input
                id="purchasePrice"
                className={styles.input}
                type="number"
                min={0}
                step="0.01"
                placeholder="e.g. 19.00 for a paid space"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Features</label>
            <div className={styles.checkGrid}>
              {FEATURES.map((feature) => (
                <label key={feature.key} className={styles.checkCard}>
                  <input
                    type="checkbox"
                    checked={!!features[feature.key]}
                    onChange={() => toggleFeature(feature.key)}
                  />
                  <span className={styles.checkText}>
                    <strong>{feature.label}</strong>
                    <small>{feature.description}</small>
                  </span>
                </label>
              ))}
            </div>
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
                <small>Reveals this space (name, description) to visitors.</small>
              </span>
            </label>
          </div>
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create space"}
          </button>
        </form>

        <h2 className={styles.listTitle}>Existing spaces</h2>
        {spaces.length === 0 ? (
          <p className={styles.empty}>No spaces yet.</p>
        ) : (
          <div className={styles.list}>
            {spaces.map((space) => (
              <div key={space.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>{space.name}</p>
                  <p className={styles.itemMeta}>
                    {accessLabel[space.access]} {space.requiredTier === "premium" ? "· Hosts only" : ""}
                    {space.purchasePriceCents ? ` · $${(space.purchasePriceCents / 100).toFixed(2)}` : ""} ·{" "}
                    {space.memberCount} members ·{" "}
                    {Object.entries(space.features)
                      .filter(([, enabled]) => enabled)
                      .map(([key]) => key)
                      .join(", ") || "no features"}
                  </p>
                </div>
                <div className={styles.itemActions}>
                  <button
                    className={space.publicPreview ? styles.toggleOn : styles.toggle}
                    onClick={() => handleTogglePreview(space.id, !space.publicPreview)}
                  >
                    {space.publicPreview ? "On explore" : "Off explore"}
                  </button>
                  <button className={styles.delete} onClick={() => handleDelete(space.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
</Nav>
  );
}
