"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import styles from "../events.module.css";

function formatDate(iso) {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getNow() {
  return Date.now();
}

export default function EventDetail({ event, uid, userName }) {
  const [attendees, setAttendees] = useState({ count: 0, names: [], mine: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rsvpMsg, setRsvpMsg] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [purchasedKeys, setPurchasedKeys] = useState(new Set());

  const loadAttendees = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/events/${event.id}/attendees?occurrenceId=${encodeURIComponent(event.occurrenceId || "")}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setAttendees({ count: data.count, names: data.names || [], mine: data.mine });
    } catch {
      // Attendee counts are best-effort.
    }
  }, [event.id, event.occurrenceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async one-shot fetch of attendee counts and purchases; no local state is read or synced here
    loadAttendees();
    fetch("/api/purchases")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setPurchasedKeys(new Set(data.keys)))
      .catch(() => {});
  }, [loadAttendees]);

  async function handleRsvp() {
    setBusy(true);
    setError("");
    setConfirming(false);
    try {
      const res = await fetch("/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, occurrenceId: event.occurrenceId || "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (res.status === 409 ? "This event is full." : "RSVP failed"));
        return;
      }
      setRsvpMsg(data.joined ? "You're going!" : "RSVP removed.");
      await loadAttendees();
    } finally {
      setBusy(false);
    }
  }

  const now = getNow();
  const isLive = new Date(event.startTime).getTime() <= now;
  const atCapacity = event.capacity > 0 && attendees.count >= event.capacity;
  const isPaid = Number(event.purchasePriceCents) > 0;
  const purchased = purchasedKeys.has(`event:${event.id}`);
  const joinDisabled = busy || (atCapacity && !attendees.mine);

  return (
    <section className={styles.eventCard}>
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
      </div>
      <div className={styles.eventBody}>
        <h1 className={styles.eventTitle}>{event.title}</h1>
        {isPaid && (
          <p className={styles.priceTag}>
            Ticket ${(Number(event.purchasePriceCents) / 100).toFixed(2)}
            {purchased && " · purchased"}
          </p>
        )}
        {event.description && <p className={styles.eventDesc}>{event.description}</p>}
        <p className={styles.eventMeta}>
          {formatDate(event.startTime)}
          {event.endTime && (
            <> · until {new Date(event.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>
          )}
          {event.roomSlug && <> · lounge open</>}
        </p>
        <p className={styles.attendees}>
          {attendees.count} {attendees.count === 1 ? "member" : "members"} going
          {event.capacity > 0 && (
            <span className={styles.capacity}> of {event.capacity}</span>
          )}
          {attendees.names.length > 0 && (
            <span className={styles.attendeeNames}> — {attendees.names.join(", ")}</span>
          )}
        </p>
        {atCapacity && !attendees.mine && (
          <p className={styles.capacityFull}>This event is full.</p>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {rsvpMsg && <p className={styles.success}>{rsvpMsg}</p>}
        <div className={styles.actions}>
          {attendees.mine && confirming ? (
            <span className={styles.rsvpConfirm}>
              <button
                className={`${styles.rsvp} ${styles.rsvpRemove}`}
                onClick={handleRsvp}
                disabled={busy}
              >
                {busy ? "Canceling…" : "Cancel RSVP"}
              </button>
              <button className={styles.rsvpKeep} onClick={() => setConfirming(false)} disabled={busy}>
                Keep
              </button>
            </span>
          ) : (
            <button
              className={attendees.mine ? `${styles.rsvp} ${styles.rsvpActive}` : styles.rsvp}
              onClick={() => (attendees.mine ? setConfirming(true) : handleRsvp())}
              disabled={joinDisabled}
            >
              {busy ? "Saving…" : attendees.mine ? "Going ✓" : atCapacity ? "Full" : "RSVP"}
            </button>
          )}
          <a className={styles.calendar} href={`/api/events/${event.id}/ics`}>
            Add to calendar
          </a>
          {event.roomSlug && (
            <Link className={styles.join} href={`/rooms/${event.roomSlug}`}>
              Join the lounge
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
