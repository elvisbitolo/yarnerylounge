"use client";

import styles from "./recordings.module.css";

const MAX_AVATARS = 4;

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

// Overlapping attendee avatars. Rendered with background images rather than
// <img> so a broken avatar URL degrades to the initial without a broken-image
// icon, and so the library avoids a batch of image-optimization warnings.
export default function ParticipantStack({ participants = [], max = MAX_AVATARS }) {
  const list = participants.filter((p) => p?.name || p?.avatar);
  if (list.length === 0) return null;
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;

  return (
    <span className={styles.avatars}>
      {shown.map((p, index) => (
        <span
          key={p.id || `${p.name || "participant"}-${index}`}
          className={styles.avatar}
          style={p.avatar ? { backgroundImage: `url("${p.avatar}")` } : undefined}
          role="img"
          aria-label={p.name || "Participant"}
          title={p.name || undefined}
        >
          {p.avatar ? "" : initial(p.name)}
        </span>
      ))}
      {extra > 0 && <span className={`${styles.avatar} ${styles.avatarMore}`}>+{extra}</span>}
    </span>
  );
}
