"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, HeartHandshake } from "lucide-react";
import styles from "./members.module.css";

export default function BlindDateCard() {
  const [member, setMember] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/members/blind-date");
        if (cancelled) return;
        if (res.status === 403) {
          setMember(null);
          setError("");
          return;
        }
        const data = await res.json();
        setMember(data.member || null);
      } catch {
        if (!cancelled) setError("Could not load today's match.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (busy) {
    return (
      <div className={styles.blindDateCard}>
        <p className={styles.blindDateLoading}>Finding today&apos;s match…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.blindDateCard}>
        <p className={styles.blindDateError}>{error}</p>
      </div>
    );
  }

  if (!member) return null;

  const initials = (member.memberName || "M")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className={styles.blindDateCard}>
      <div className={styles.blindDateHeader}>
        <span className={styles.blindDateIcon}>
          <HeartHandshake size={18} />
        </span>
        <div>
          <p className={styles.blindDateKicker}>Lounge Matchmaker</p>
          <h2 className={styles.blindDateTitle}>Daily Blind Date</h2>
        </div>
      </div>
      <Link href={`/members/${member.memberId}`} className={styles.blindDateBody}>
        <span className={styles.blindDateAvatar}>
          {member.photoURL ? (
            <img className={styles.blindDatePhoto} src={member.photoURL} alt={member.memberName} />
          ) : (
            initials
          )}
        </span>
        <span className={styles.blindDateInfo}>
          <span className={styles.blindDateName}>{member.memberName}</span>
          {member.headline && <span className={styles.blindDateHeadline}>{member.headline}</span>}
          <span className={styles.blindDateMeta}>
            {member.country && <span>{member.country}</span>}
            {Array.isArray(member.hobbies) && member.hobbies.length > 0 && (
              <span>{member.hobbies.slice(0, 3).join(" · ")}</span>
            )}
          </span>
        </span>
        <span className={styles.blindDateSparkle}>
          <Sparkles size={16} />
        </span>
      </Link>
      <p className={styles.blindDateNote}>
        <span className={styles.blindDateNoteIcon}>✨</span> One new curated profile every 24 hours.
      </p>
    </div>
  );
}