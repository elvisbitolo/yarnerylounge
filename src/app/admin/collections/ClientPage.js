"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "../questions/questions.module.css";

export default function AdminCollectionsPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [collections, setCollections] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState([]);

  const loadCollections = useCallback(async () => {
    const res = await fetch("/api/admin/collections");
    if (res.ok) setCollections((await res.json()).collections);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadCollections();
      fetch("/api/spaces?admin=1")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setSpaces(data.spaces));
    });
    return unsub;
  }, [router, loadCollections]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  function toggleSpace(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function startEdit(collection) {
    setEditingId(collection.id);
    setName(collection.name || "");
    setDescription(collection.description || "");
    setSelected(collection.spaceIds || []);
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setSelected([]);
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(
        editingId ? `/api/admin/collections/${editingId}` : "/api/admin/collections",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, spaceIds: selected }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save collection");
      resetForm();
      await loadCollections();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    setError("");
    try {
      const res = await fetch(`/api/admin/collections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete collection");
      await loadCollections();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Collections</h1>
        <p className={styles.subtitle}>
          Group spaces together, like Mighty Network collections. Collections
          appear at the top of the sidebar so members can find their content.
        </p>
        {error && <p className={styles.error}>{error}</p>}

        <form className={styles.form} onSubmit={handleSave}>
          <h2 className={styles.formTitle}>
            {editingId ? "Edit collection" : "New collection"}
          </h2>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="c-name">Name</label>
            <input
              id="c-name"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Yoga Studio"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="c-desc">Description</label>
            <textarea
              id="c-desc"
              className={styles.textarea}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What lives in this collection?"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Spaces in this collection</label>
            {spaces.length === 0 ? (
              <p className={styles.subtitle}>No spaces yet.</p>
            ) : (
              spaces.map((space) => (
                <label key={space.id} className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={selected.includes(space.id)}
                    onChange={() => toggleSpace(space.id)}
                  />
                  <span>{space.name}</span>
                </label>
              ))
            )}
          </div>
          <div className={styles.fieldRow}>
            <button className={styles.submit} disabled={busy}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Create collection"}
            </button>
            {editingId && (
              <button type="button" className={styles.secondary} onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <h2 className={styles.listTitle}>Collections</h2>
        {collections.length === 0 ? (
          <p className={styles.empty}>No collections yet.</p>
        ) : (
          <div className={styles.list}>
            {collections.map((collection) => {
              const collectionSpaces = spaces.filter((space) =>
                (collection.spaceIds || []).includes(space.id)
              );
              return (
                <div key={collection.id} className={styles.item}>
                  <div>
                    <p className={styles.itemName}>{collection.name}</p>
                    <p className={styles.itemMeta}>
                      {collectionSpaces.length === 0
                        ? "No spaces"
                        : collectionSpaces.map((s) => s.name).join(", ")}
                    </p>
                  </div>
                  <div className={styles.itemActions}>
                    <button
                      className={styles.toggle}
                      onClick={() => startEdit(collection)}
                    >
                      Edit
                    </button>
                    <button
                      className={styles.delete}
                      onClick={() => handleDelete(collection.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Nav>
  );
}
