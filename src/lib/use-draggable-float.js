"use client";

import { useRef, useState } from "react";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Makes a floating element draggable with the pointer, persisting its position
 * to localStorage so it stays where the user put it. Shared by the theme
 * button, the room chat button and the room music controls.
 *
 * anchor — "right" positions via `right`, "left" via `left`.
 */
export default function useDraggableFloat({
  storageKey,
  defaultPos,
  width = 48,
  height = 48,
  edgeMargin = 4,
  minBottom = 76,
  anchor = "right",
}) {
  const [pos, setPos] = useState(() => {
    if (typeof window === "undefined") {
      return { bottom: defaultPos.bottom, [anchor]: defaultPos[anchor] };
    }
    const maxWidth = Math.max(edgeMargin, window.innerWidth - width - edgeMargin);
    const maxBottom = Math.max(minBottom, window.innerHeight - height - edgeMargin);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (
        saved &&
        Number.isFinite(saved.bottom) &&
        Number.isFinite(saved[anchor])
      ) {
        return {
          [anchor]: clamp(saved[anchor], edgeMargin, maxWidth),
          bottom: clamp(saved.bottom, minBottom, maxBottom),
        };
      }
    } catch {
      /* use the default */
    }
    return {
      [anchor]: clamp(defaultPos[anchor] ?? edgeMargin, edgeMargin, maxWidth),
      bottom: clamp(defaultPos.bottom ?? minBottom, minBottom, maxBottom),
    };
  });

  const dragRef = useRef(null);
  const movedRef = useRef(0);
  const suppressClickRef = useRef(false);

  function onPointerDown(e) {
    // Never hijack range inputs / text boxes (e.g. the volume slider).
    if (e.target.closest && e.target.closest("input,select,textarea")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const anchorValue =
      anchor === "right" ? window.innerWidth - rect.right : rect.left;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      anchor: anchorValue,
      bottom: window.innerHeight - rect.bottom,
    };
    movedRef.current = 0;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    movedRef.current = Math.max(movedRef.current, Math.abs(dx) + Math.abs(dy));
    const maxWidth = Math.max(edgeMargin, window.innerWidth - width - edgeMargin);
    const maxBottom = Math.max(minBottom, window.innerHeight - height - edgeMargin);
    const anchorNext =
      anchor === "right"
        ? dragRef.current.anchor - dx
        : dragRef.current.anchor + dx;
    setPos({
      [anchor]: clamp(anchorNext, edgeMargin, maxWidth),
      bottom: clamp(dragRef.current.bottom - dy, minBottom, maxBottom),
    });
  }

  function onPointerEnd(e) {
    if (!dragRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const wasDrag = movedRef.current > 8;
    dragRef.current = null;
    if (wasDrag) {
      suppressClickRef.current = true;
      try {
        localStorage.setItem(storageKey, JSON.stringify(pos));
      } catch {
        /* ignore quota / private mode */
      }
    }
  }

  /**
   * Returns true (and clears the flag) when the next click should be ignored
   * because the element was just dragged. Call this at the top of your own
   * onClick handler.
   */
  function wasDragged() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }

  return {
    pos,
    style: {
      position: "fixed",
      zIndex: 999,
      bottom: pos.bottom,
      [anchor]: pos[anchor],
      touchAction: "none",
    },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
    wasDragged,
  };
}