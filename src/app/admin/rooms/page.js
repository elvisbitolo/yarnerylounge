"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "./admin.module.css";

export default function AdminRoomsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(20);
  const [groupId, setGroupId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [kind, setKind] = useState("standard");
  const [publicPreview, setPublicPreview] = useState(false);
  const [opensAt, setOpensAt] = useState("");
  const [hostId, setHostId] = useState("");
  const [coHostIds, setCoHostIds] = useState([]);
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/rooms");
    if (res.ok) setRooms((await res.json()).rooms);
  }, []);

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/groups");
    if (res.ok) setGroups((await res.json()).groups);
  }, []);

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
      loadRooms();
      loadGroups();
      loadSpaces();
      fetch("/api/admin/members")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setMembers(data.members));
    });
    return unsub;
  }, [router, loadRooms, loadGroups, loadSpaces]);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        maxParticipants,
        groupId,
        spaceId,
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

    const room = data.room;
    const assignments = [];
    if (hostId) {
      assignments.push({
        scopeType: "room",
        scopeId: room.id,
        userId: hostId,
        role: "host",
      });
    }
    for (const userId of coHostIds) {
      assignments.push({
        scopeType: "room",
        scopeId: room.id,
        userId,
        role: "co-host",
      });
    }
    for (const payload of assignments) {
      await fetch("/api/admin/host-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setName("");
    setDescription("");
    setMaxParticipants(20);
    setGroupId("");
    setSpaceId("");
    setKind("standard");
    setPublicPreview(false);
    setOpensAt("");
    setHostId("");
    setCoHostIds([]);
    await loadRooms();
  }

  async function handleDelete(id) {
    await fetch(`/api/rooms/${id}`, { method: "DELETE" });
    await loadRooms();
  }

  async function handleTogglePreview(id, value) {
    await fetch(`/api/rooms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicPreview: value }),
    });
    await loadRooms();
  }

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  return (
      <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Manage rooms</h1>

        <form className={styles.form} onSubmit={handleCreate}>
          <h2 className={styles.formTitle}>Create a room</h2>
          {error && <p className={styles.error}>{error}</p>}
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
            <label className={styles.label} htmlFor="group">Group (optional)</label>
            <select
              id="group"
              className={styles.input}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">Main community</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="space">Space (optional)</label>
            <select
              id="space"
              className={styles.input}
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
            >
              <option value="">No space</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>{space.name}</option>
              ))}
            </select>
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
            <small className={styles.help}>
              Members can only join from this time onward. Leave blank to open now.
            </small>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="host">Host</label>
            <select
              id="host"
              className={styles.input}
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
            >
              <option value="">No host (you manage it)</option>
              {members
                .filter((m) => m.role !== "owner")
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.email || "Member"}</option>
                ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Co-hosts</label>
            <div className={styles.checkList}>
              {members
                .filter((m) => m.role !== "owner")
                .map((m) => (
                  <label key={m.id} className={styles.checkCard}>
                    <input
                      type="checkbox"
                      checked={coHostIds.includes(m.id)}
                      onChange={(e) =>
                        setCoHostIds((prev) =>
                          e.target.checked
                            ? [...prev, m.id]
                            : prev.filter((id) => id !== m.id)
                        )
                      }
                    />
                    <span className={styles.checkText}>
                      {m.name || m.email || "Member"}
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
                <small>Reveals this room (name, description) to visitors.</small>
              </span>
            </label>
          </div>
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create room"}
          </button>
        </form>

        <h2 className={styles.listTitle}>Existing rooms</h2>
        {rooms.length === 0 ? (
          <p className={styles.empty}>No rooms yet.</p>
        ) : (
          <div className={styles.list}>
            {rooms.map((room) => (
              <div key={room.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>{room.name}</p>
                  <p className={styles.itemMeta}>
                    {room.status} · {room.maxParticipants} max · {room.slug}
                    {room.opensAt
                      ? ` · opens ${new Date(room.opensAt.toMillis ? room.opensAt.toMillis() : room.opensAt).toLocaleString()}`
                      : " · open now"}
                  </p>
                </div>
                <div className={styles.itemActions}>
                  <a
                    className={styles.toggle}
                    href={`/admin/hosts?scopeType=room&scopeId=${room.id}`}
                  >
                    Hosts
                  </a>
                  <button
                    className={room.publicPreview ? styles.toggleOn : styles.toggle}
                    onClick={() => handleTogglePreview(room.id, !room.publicPreview)}
                  >
                    {room.publicPreview ? "On explore" : "Off explore"}
                  </button>
                  <button className={styles.delete} onClick={() => handleDelete(room.id)}>
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
