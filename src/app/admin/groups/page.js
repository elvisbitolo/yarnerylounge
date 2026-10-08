"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import ContentEditor from "@/components/admin/ContentEditor";
import styles from "../rooms/admin.module.css";

export default function AdminGroupsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groups, setGroups] = useState([]);
  const [editing, setEditing] = useState(null);
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/groups");
    if (res.ok) setGroups((await res.json()).groups);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadGroups();
    });
    return unsub;
  }, [router, loadGroups]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to create group");
      return;
    }
    setName("");
    setDescription("");
    await loadGroups();
  }

  async function handleDelete(id) {
    await fetch(`/api/groups/${id}`, { method: "DELETE" });
    await loadGroups();
  }

  return (
      <div className={styles.container}>
        <h1 className={styles.title}>Manage groups</h1>

        <form className={styles.form} onSubmit={handleCreate}>
          <h2 className={styles.formTitle}>Create a group</h2>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">Group name</label>
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
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create group"}
          </button>
        </form>

        <h2 className={styles.listTitle}>Existing groups</h2>
        {groups.length === 0 ? (
          <p className={styles.empty}>No groups yet.</p>
        ) : (
          <div className={styles.list}>
            {groups.map((group) => (
              <div key={group.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>{group.name}</p>
                  <p className={styles.itemMeta}>
                    {group.status} · {group.memberCount} members · {group.slug}
                  </p>
                </div>
                <div className={styles.itemActions}>
                  <button
                    className={styles.toggle}
                    onClick={() => setEditing(editing === group.id ? null : group.id)}
                  >
                    {editing === group.id ? "Close" : "Edit"}
                  </button>
                  <button className={styles.delete} onClick={() => handleDelete(group.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {groups.map((group) =>
          editing === group.id ? (
            <ContentEditor
              key={group.id}
              kind="group"
              record={group}
              onCancel={() => setEditing(null)}
              onSaved={(id, patch) => {
                setGroups((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
              }}
            />
          ) : null
        )}
      </div>
  );
}
