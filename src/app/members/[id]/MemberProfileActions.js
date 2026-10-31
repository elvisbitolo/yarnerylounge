"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import MemberSafetyControls from "./MemberSafetyControls";
import styles from "./profile-actions.module.css";

export default function MemberProfileActions({ targetId, targetName }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.moreButton} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal size={18} />
        <span>More</span>
      </button>
      {open && (
        <div className={styles.menu}>
          <MemberSafetyControls targetId={targetId} targetName={targetName} />
        </div>
      )}
    </div>
  );
}
