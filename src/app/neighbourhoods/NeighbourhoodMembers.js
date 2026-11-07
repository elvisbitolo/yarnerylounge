"use client";

import { useState } from "react";
import Link from "next/link";

function InitialAvatar({ name, className }) {
  return (
    <span className={className} aria-hidden="true">
      {(name || "M").trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function NeighbourhoodMembers({ members = [], color, styles }) {
  const [expanded, setExpanded] = useState(false);
  const preview = members.slice(0, 5);
  const remaining = Math.max(0, members.length - preview.length);

  if (members.length === 0) {
    return <p className={styles.memberEmpty}>Be the first to join this neighbourhood.</p>;
  }

  return (
    <>
      <div className={styles.memberPreview} style={{ "--hoodColor": color }}>
        <div className={styles.memberAvatars} aria-label={`${members.length} neighbourhood members`}>
          {preview.map((member) => (
            <Link
              key={member.id}
              href={`/members/${member.id}`}
              className={styles.memberAvatarLink}
              title={member.name}
              aria-label={`View ${member.name}'s profile`}
            >
              {member.photoURL ? (
                <img src={member.photoURL} alt="" loading="lazy" />
              ) : (
                <InitialAvatar name={member.name} className={styles.memberAvatarFallback} />
              )}
            </Link>
          ))}
          {remaining > 0 && (
            <button
              type="button"
              className={styles.memberAvatarMore}
              onClick={() => setExpanded(true)}
              aria-label={`Show ${remaining} more members`}
              aria-expanded={expanded}
            >
              +{remaining}
            </button>
          )}
        </div>
        <div className={styles.memberSummary}>
          <button
            type="button"
            className={styles.memberCountButton}
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {members.length} {members.length === 1 ? "member" : "members"}
          </button>
          <span className={styles.memberSummaryHint}>Meet your neighbours</span>
        </div>
      </div>

      {expanded && (
        <section className={styles.memberDirectory} style={{ "--hoodColor": color }} aria-label="Neighbourhood members">
          <p className={styles.memberDirectoryTitle}>Everyone in this neighbourhood</p>
          <div className={styles.memberDirectoryList}>
            {members.map((member) => (
              <Link
                key={member.id}
                href={`/members/${member.id}`}
                className={styles.memberDirectoryLink}
              >
                {member.photoURL ? (
                  <img
                    src={member.photoURL}
                    alt=""
                    loading="lazy"
                    className={styles.memberDirectoryAvatar}
                  />
                ) : (
                  <InitialAvatar name={member.name} className={styles.memberDirectoryAvatar} />
                )}
                <span className={styles.memberDirectoryName}>{member.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
