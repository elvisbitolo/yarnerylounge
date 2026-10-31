"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import MemberSafetyControls from "./MemberSafetyControls";
import styles from "./profile-actions.module.css";

export default function MemberProfileActions({ targetId, targetName }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  function toggleMenu() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(300, window.innerWidth - 24);
    setPosition({
      top: Math.min(rect.bottom + 8, window.innerHeight - 16),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onViewportChange() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  return (
    <div className={styles.wrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.moreButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="member-more-menu"
        onClick={toggleMenu}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
        <span>More</span>
      </button>
      {open && position && createPortal(
        <div
          ref={menuRef}
          id="member-more-menu"
          role="menu"
          aria-label={`More actions for ${targetName}`}
          className={styles.menu}
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <MemberSafetyControls targetId={targetId} targetName={targetName} />
        </div>,
        document.body
      )}
    </div>
  );
}
