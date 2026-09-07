"use client";

import { useState, useEffect, useRef } from "react";
import {
  collection,
  doc,
  query,
  where,
  limit,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import styles from "./account.module.css";

const DEFAULT_STEPS = [
  { key: "profile", label: "Complete your profile", href: "/account/profile", cta: "Edit profile" },
  { key: "room", label: "Join your first live room", href: "/rooms", cta: "Browse rooms" },
  { key: "post", label: "Make your first post", href: "/feed", cta: "Open the feed" },
  { key: "rsvp", label: "RSVP to an event", href: "/events", cta: "See events" },
];

export default function WelcomeChecklist({ uid, initialProfile, steps }) {
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
    Promise.all([
      getDoc(doc(db, "users", uid)),
      getDoc(query(collection(db, "posts"), where("authorId", "==", uid), limit(1))),
      getDoc(query(collection(db, "rsvps"), where("userId", "==", uid), limit(1))),
      getDoc(query(collection(db, "roomEvents"), where("userId", "==", uid), limit(1))),
    ])
      .then(([userSnap, postsSnap, rsvpsSnap, roomsSnap]) => {
        if (cancelled) return;
        if (userSnap.exists()) setProfile(userSnap.data());
        setHasPost(!postsSnap.empty);
        setHasRsvp(!rsvpsSnap.empty);
        setHasRoomEvent(!roomsSnap.empty);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid]);

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
