"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./account.module.css";

const DEFAULT_STEPS = [
  { key: "profile", label: "Complete your profile", href: "/account/profile", cta: "Edit profile" },
  { key: "room", label: "Join your first live room", href: "/rooms", cta: "Browse rooms" },
  { key: "post", label: "Make your first post", href: "/feed", cta: "Open the feed" },
  { key: "rsvp", label: "RSVP to an event", href: "/events", cta: "See events" },
];

export default function WelcomeChecklist({ initialProfile, steps }) {
  const [profile, setProfile] = useState(initialProfile || {});
  const [hasRoomEvent, setHasRoomEvent] = useState(false);
  const [hasPost, setHasPost] = useState(false);
  const [hasRsvp, setHasRsvp] = useState(false);
  const firedRef = useRef(false);

  const STEPS = steps && steps.length > 0 ? steps : DEFAULT_STEPS;

  useEffect(() => {
    let cancelled = false;
    // All four states change rarely (profile edits, one room/post/rsvp) — a
    // one-time read avoids keeping permanent real-time listeners open.
    fetch("/api/checklist")
      .then((res) => (res.ok ? res.json() : { check: null }))
      .then((data) => {
        if (cancelled || !data?.check) return;
        const { profile: nextProfile, post, rsvp, room } = data.check;
        if (nextProfile && typeof nextProfile === "object") {
          setProfile((prev) => ({ ...prev, ...nextProfile }));
        }
        setHasPost(!!post);
        setHasRsvp(!!rsvp);
        setHasRoomEvent(!!room);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const profileDone = !!(profile.bio || profile.headline || profile.location);
  const doneMap = { profile: profileDone, room: hasRoomEvent, post: hasPost, rsvp: hasRsvp };
  const doneCount = STEPS.filter((step) => doneMap[step.key]).length;
  const allDone = doneCount === STEPS.length;

  useEffect(() => {
    if (allDone && STEPS.length > 0 && !firedRef.current) {
      firedRef.current = true;
      fetch("/api/checklist/complete", { method: "POST" }).catch(() => {});
    }
  }, [allDone, STEPS.length]);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>
        {allDone ? "Welcome, you're all set!" : "Welcome checklist"}
      </h2>
      <p className={styles.checklistProgress}>
        {doneCount} of {STEPS.length} complete
      </p>
      <div className={styles.progressTrack}>
        <div
          className={styles.progressFill}
          style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
        />
      </div>
      <ul className={styles.checklist}>
        {STEPS.map((step) => {
          const done = doneMap[step.key];
          return (
            <li
              key={step.key}
              className={done ? `${styles.checkItem} ${styles.checkDone}` : styles.checkItem}
            >
              <span className={styles.checkMark}>{done ? "✓" : "•"}</span>
              <span className={styles.checkLabel}>{step.label}</span>
              {!done && (
                <a className={styles.checkCta} href={step.href}>{step.cta}</a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
