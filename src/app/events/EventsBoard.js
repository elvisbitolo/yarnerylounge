"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import styles from "./events.module.css";

function getNow() {
  return Date.now();
}

function formatDate(iso) {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EventsBoard({ events, uid, userName }) {
  const [rsvpData, setRsvpData] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [rsvpMsg, setRsvpMsg] = useState("");
  const [confirmingId, setConfirmingId] = useState("");
  const [purchasedKeys, setPurchasedKeys] = useState(new Set());

  useEffect(() => {
    fetch("/api/purchases")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setPurchasedKeys(new Set(data.keys)))
      .catch(() => {});
  }, []);

  const loadAttendees = useCallback(
    async (event) => {
      const key = event.occurrenceId || event.id;
      try {
        const res = await fetch(
          `/api/events/${event.id}/attendees?occurrenceId=${encodeURIComponent(event.occurrenceId || "")}`
        );
        if (!res.ok) return;
        const data = await res.json();
        setRsvpData((prev) => ({
          ...prev,
          [key]: {
            count: data.count,
            names: data.names,
            mine: data.mine,
          },
        }));
      } catch {
        // Attendee counts are best-effort; the event list still renders.
      }
    },
    []
  );

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the fresh session cookie is sent
        window.location.assign("/login");
      }
    });
    for (const event of events) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async one-shot fetch of attendee counts per event; no local state is read or synced here
      loadAttendees(event);
    }
    return () => unsubAuth();
  }, [events, loadAttendees]);

  async function handleRsvp(eventId, occurrenceId) {
    if (!uid) return;
    setBusyId(`${occurrenceId || eventId}`);
    setConfirmingId("");
    try {
      const res = await fetch("/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, occurrenceId: occurrenceId || "" }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setError(data.error || "This event is full.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "RSVP failed");
        return;
      }
      setError("");
      setRsvpMsg(data.joined ? "You're going!" : "RSVP removed.");
      const event = events.find((e) => (e.occurrenceId || e.id) === (occurrenceId || eventId));
      if (event) loadAttendees(event);
    } finally {
      setBusyId("");
    }
  }

  const now = getNow();
  const upcoming = events.filter((e) => new Date(e.startTime).getTime() > now);
  const past = events.filter((e) => new Date(e.startTime).getTime() <= now);

  function renderEvent(event) {
    const key = event.occurrenceId || event.id;
    const data = rsvpData[key];
    const attendees = data?.names || [];
    const mine = data?.mine || false;
    const count = data?.count || 0;
    const isLive = new Date(event.startTime).getTime() <= now;
    const atCapacity = event.capacity > 0 && count >= event.capacity;
    const isPaid = Number(event.purchasePriceCents) > 0;
    const purchased = purchasedKeys.has(`event:${event.id}`);
    const joinDisabled = !!busyId || (atCapacity && !mine);

    return (
      <div key={key} className={styles.eventCard}>
        <div className={styles.eventDate}>
          <span className={styles.eventDay}>
            {new Date(event.startTime).toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
          <span className={styles.eventTime}>
            {new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
          {isLive ? (
            <span className={`${styles.tag} ${styles.tagLive}`}>Live</span>
          ) : (
            <span className={`${styles.tag} ${styles.tagUpcoming}`}>Upcoming</span>
          )}
          {event.occurrenceIndex > 0 && (
            <span className={`${styles.tag} ${styles.tagRepeat}`}>
              Recurring #{event.occurrenceIndex + 1}
            </span>
          )}
        </div>
        <div className={styles.eventBody}>
          <h2 className={styles.eventTitle}>{event.title}</h2>
          {isPaid && (
            <p className={styles.priceTag}>
              Ticket ${(Number(event.purchasePriceCents) / 100).toFixed(2)}
              {purchased && " · purchased"}
            </p>
          )}
          {event.description && <p className={styles.eventDesc}>{event.description}</p>}
          <p className={styles.eventMeta}>
            {formatDate(event.startTime)}
            {event.endTime && <> · until {new Date(event.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>}
            {event.roomSlug && <> · room open</>}
          </p>
          {attendees.length > 0 && (
            <p className={styles.attendees}>
              {count} {count === 1 ? "member" : "members"} going
              {event.capacity > 0 && (
                <span className={styles.capacity}> of {event.capacity}</span>
              )}
              {attendees.length <= 6 && (
                <span className={styles.attendeeNames}>
                  {" — "}{attendees.join(", ")}
                </span>
              )}
            </p>
          )}
          {atCapacity && !mine && (
            <p className={styles.capacityFull}>This event is full.</p>
          )}
          <div className={styles.actions}>
            {mine && confirmingId === key ? (
              <span className={styles.rsvpConfirm}>
                <button
                  className={`${styles.rsvp} ${styles.rsvpRemove}`}
                  onClick={() => handleRsvp(event.id, event.occurrenceId)}
                  disabled={joinDisabled}
                >
                  {busyId === key ? "Canceling…" : "Cancel RSVP"}
                </button>
                <button
                  className={styles.rsvpKeep}
                  onClick={() => setConfirmingId("")}
                  disabled={!!busyId}
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                className={mine ? `${styles.rsvp} ${styles.rsvpActive}` : styles.rsvp}
                onClick={() => (mine ? setConfirmingId(key) : handleRsvp(event.id, event.occurrenceId))}
                disabled={joinDisabled}
              >
                {busyId === key ? "Saving…" : mine ? "Going ✓" : atCapacity ? "Full" : "RSVP"}
              </button>
            )}
            <a className={styles.calendar} href={`/api/events/${event.id}/ics`}>
              Add to calendar
            </a>
            <Link className={styles.calendar} href={`/events/${event.id}`}>Details</Link>
            {event.roomSlug && (
              <Link className={styles.join} href={`/rooms/${event.roomSlug}`}>Join the room</Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <p className={styles.error}>{error}</p>}
      {rsvpMsg && <p className={styles.success}>{rsvpMsg}</p>}
      {upcoming.length === 0 && past.length === 0 ? (
        <p className={styles.empty}>No events scheduled yet — check back soon.</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Upcoming</h2>
              <div className={styles.list}>{upcoming.map(renderEvent)}</div>
            </section>
          )}
          {past.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Past</h2>
              <div className={styles.list}>{past.map(renderEvent)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
