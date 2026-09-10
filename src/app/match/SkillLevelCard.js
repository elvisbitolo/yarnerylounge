"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle, Sparkles } from "lucide-react";
import styles from "./match.module.css";
import { initialsFor } from "./match-utils";

export default function SkillLevelCard() {
  const [members, setMembers] = useState([]);
  const [skillLevel, setSkillLevel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/members/skill-level")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("skill matches failed"))))
      .then((data) => {
        if (!active) return;
        setMembers(Array.isArray(data.members) ? data.members : []);
        setSkillLevel(data.skillLevel || "");
      })
      .catch(() => active && setError("Could not load skill-level matches. Try again later."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const label = skillLevel ? skillLevel.charAt(0).toUpperCase() + skillLevel.slice(1) : "your skill level";

  return (
    <section className={styles.matchCard} aria-labelledby="skill-matches-title">
      <div className={styles.matchCardHeader}>
        <span className={styles.matchCardIcon}>
          <Sparkles size={20} />
        </span>
        <div>
          <p className={styles.matchKicker}>Targeted technique shares</p>
          <h2 id="skill-matches-title" className={styles.matchCardTitle}>Skill-Level Matches</h2>
        </div>
      </div>
      <div className={styles.matchCardImage}>
        <Image
          src="/images/match/modern-hobby-grid.jpg"
          alt="Craft supplies and hobby projects shared by members"
          fill
          sizes="(max-width: 640px) 100vw, 920px"
        />
      </div>
      <div className={styles.matchCardBody}>
        <p className={styles.matchCardDesc}>
          Connect with crafters at your exact skill level for targeted technique shares.
        </p>
        {loading ? (
          <p className={styles.statusLine}>Finding {label} crafters…</p>
        ) : error ? (
          <p className={styles.error}>{error}</p>
        ) : !skillLevel ? (
          <p className={styles.statusLine}>Complete your onboarding profile to find skill-level matches.</p>
        ) : members.length === 0 ? (
          <p className={styles.statusLine}>No other {label.toLowerCase()} crafters yet. Check back soon.</p>
        ) : (
          <>
            <p className={styles.matchCount}>{members.length} {label.toLowerCase()} {members.length === 1 ? "crafter" : "crafters"}</p>
            <ul className={styles.matchGrid}>
              {members.slice(0, 8).map((member) => (
                <li key={member.id} className={styles.matchTile}>
                  <Link href={`/members/${member.id}`} className={styles.matchTileLink}>
                    {member.photoURL ? (
                      <Image src={member.photoURL} alt={member.name} width={72} height={72} className={styles.matchTilePhoto} />
                    ) : (
                      <span className={styles.matchTileInitials} aria-hidden="true">{initialsFor(member.name)}</span>
                    )}
                    <span className={styles.matchTileName}>{member.name}</span>
                    {member.headline && <span className={styles.matchTileMeta}>{member.headline}</span>}
                  </Link>
                  <Link href={`/chat?with=${member.id}`} className={styles.tileAction}><MessageCircle size={14} /> Say hello</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
