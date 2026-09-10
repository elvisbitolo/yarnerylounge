"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./explore.module.css";

export default function MembersToExplore() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = "/api/members/similar";
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setMembers(data.members || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className={styles.loading}>Finding members to explore…</p>;
  }

  if (members.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Members to explore</h2>
      <div className={styles.grid}>
        {members.map((member) => (
          <Link
            key={member.id}
            href={`/members/${member.id}`}
            className={styles.card}
            title={`${member.name} · ${member.score}% match`}
          >
            <span className={styles.avatar}>
              {member.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.avatarImg} src={member.photoURL} alt={member.name} />
              ) : (
                (member.name || "?").slice(0, 1).toUpperCase()
              )}
            </span>
            <span className={styles.cardBody}>
              <span className={styles.name}>{member.name}</span>
              {member.headline && <span className={styles.headline}>{member.headline}</span>}
              {member.country && <span className={styles.location}>{member.country}</span>}
              <span className={styles.match}>{member.score}% match</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}