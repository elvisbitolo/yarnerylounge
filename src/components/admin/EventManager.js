"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "@/app/admin/rooms/admin.module.css";

export default function EventManager({ hostOnly = false }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [roomSlug, setRoomSlug] = useState("");
  const [capacity, setCapacity] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [recurFreq, setRecurFreq] = useState("");
  const [recurCount, setRecurCount] = useState(1);
  const [spaceId, setSpaceId] = useState(() => {
    if (hostOnly && typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("spaceId") || "";
    }
    return "";
  });
  const [publicPreview, setPublicPreview] = useState(false);
  const [events, setEvents] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [hostScopes, setHostScopes] = useState({ spaces: [], rooms: [], events: [] });
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadEvents = useCallback(async () => {
    const res = await fetch("/api/events");
    if (res.ok) setEvents((await res.json()).events);
  }, []);

  const loadScopes = useCallback(async () => {
    if (!hostOnly) {
      const [spacesRes, roomsRes] = await Promise.all([
        fetch("/api/spaces?admin=1"),
        fetch("/api/rooms"),
      ]);
      if (spacesRes.ok) setSpaces((await spacesRes.json()).spaces);
      if (roomsRes.ok) setRooms((await roomsRes.json()).rooms);
      return;
    }
    const res = await fetch("/api/host/scopes");
    if (!res.ok) return;
    const { scopes } = await res.json();
    const hostedSpaces = scopes.filter((s) => s.scopeType === "space");
    const hostedRooms = scopes.filter((s) => s.scopeType === "room");
    const hostedEvents = scopes.filter((s) => s.scopeType === "event");
    setHostScopes({ spaces: hostedSpaces, rooms: hostedRooms, events: hostedEvents });
    setSpaces(hostedSpaces.map((s) => ({ id: s.scopeId, name: s.name })));
    setRooms(
      hostedRooms.map((s) => ({ id: s.scopeId, slug: s.slug, name: s.name }))
    );
  }, [hostOnly]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadEvents();
      loadScopes();
    });
    return unsub;
  }, [router, loadEvents, loadScopes]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  const visibleEvents = hostOnly
    ? events.filter(
        (event) =>
          hostScopes.spaces.some((s) => s.scopeId === event.spaceId) ||
          hostScopes.rooms.some((s) => s.slug === event.roomSlug) ||
          hostScopes.events.some((s) => s.scopeId === event.id)
      )
    : events;

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (hostOnly && !spaceId && !roomSlug) {
      setError("Choose a space or live room you host");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : null,
        roomSlug,
        capacity,
        spaceId,
        purchasePriceCents: purchasePrice ? Math.round(Number(purchasePrice) * 100) : 0,
        publicPreview,
        recurrence: recurFreq ? { freq: recurFreq, interval: 1, count: Number(recurCount) || 2 } : null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to create event");
      return;
    }
    setTitle("");
    setDescription("");
    setStartTime("");
    setEndTime("");
    setRoomSlug("");
    setCapacity(0);
    setSpaceId("");
    setPurchasePrice("");
    setPublicPreview(false);
    setRecurFreq("");
    setRecurCount(1);
    await loadEvents();
  }

  async function handleDelete(id) {
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    await loadEvents();
  }

  async function handleTogglePreview(id, value) {
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicPreview: value }),
    });
    await loadEvents();
  }

  return (
    <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Manage events</h1>

        {hostOnly && hostScopes.spaces.length === 0 && hostScopes.rooms.length === 0 ? (
          <p className={styles.empty}>
            You don&apos;t host a space or live room yet. Ask an admin to assign you,
            or manage events you host from the host tools.
          </p>
        ) : (
          <form className={styles.form} onSubmit={handleCreate}>
            <h2 className={styles.formTitle}>Create an event</h2>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="title">Title</label>
              <input
                id="title"
                className={styles.input}
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
              <label className={styles.label} htmlFor="startTime">Starts</label>
              <input
                id="startTime"
                className={styles.input}
                type="datetime-local"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="endTime">Ends (optional)</label>
              <input
                id="endTime"
                className={styles.input}
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="roomSlug">
                Live room ({hostOnly ? "" : "optional"})
              </label>
              <select
                id="roomSlug"
                className={styles.input}
                value={roomSlug}
                onChange={(e) => setRoomSlug(e.target.value)}
              >
                {!hostOnly && <option value="">No room</option>}
                {hostOnly && <option value="">Select a room</option>}
                {rooms
                  .filter((room) => !hostOnly || room.status === undefined || room.status === "active")
                  .map((room) => (
                    <option key={room.slug} value={room.slug}>{room.name}</option>
                  ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="capacity">Capacity (optional)</label>
              <input
                id="capacity"
                className={styles.input}
                type="number"
                min={0}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="purchasePrice">One-time price (optional)</label>
              <input
                id="purchasePrice"
                className={styles.input}
                type="number"
                min={0}
                step="0.01"
                placeholder="e.g. 29.00 for a paid event"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="space">
                Space ({hostOnly ? "" : "optional"})
              </label>
              <select
                id="space"
                className={styles.input}
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
              >
                {!hostOnly && <option value="">No space</option>}
                {hostOnly && <option value="">Select a space</option>}
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>{space.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="recurFreq">Repeat (optional)</label>
              <div style={{ display: "flex", gap: 12 }}>
                <select
                  id="recurFreq"
                  className={styles.input}
                  value={recurFreq}
                  onChange={(e) => setRecurFreq(e.target.value)}
                >
                  <option value="">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={52}
                  placeholder="Times"
                  title="Number of occurrences"
                  value={recurCount}
                  disabled={!recurFreq}
                  onChange={(e) => setRecurCount(e.target.value)}
                />
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
                  <small>Reveals this event (title, time, description) to visitors.</small>
                </span>
              </label>
            </div>
            <button className={styles.submit} type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create event"}
            </button>
          </form>
        )}

        <h2 className={styles.listTitle}>Existing events</h2>
        {visibleEvents.length === 0 ? (
          <p className={styles.empty}>No events yet.</p>
        ) : (
          <div className={styles.list}>
            {visibleEvents.map((event) => (
              <div key={event.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>{event.title}</p>
                  <p className={styles.itemMeta}>
                    {new Date(event.startTime.toMillis ? event.startTime.toMillis() : event.startTime).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {event.roomSlug ? ` · ${event.roomSlug}` : ""}
                    {event.purchasePriceCents ? ` · $${(event.purchasePriceCents / 100).toFixed(2)}` : ""}
                  </p>
                </div>
                <div className={styles.itemActions}>
                  <button
                    className={event.publicPreview ? styles.toggleOn : styles.toggle}
                    onClick={() => handleTogglePreview(event.id, !event.publicPreview)}
                  >
                    {event.publicPreview ? "On explore" : "Off explore"}
                  </button>
                  <button className={styles.delete} onClick={() => handleDelete(event.id)}>
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
