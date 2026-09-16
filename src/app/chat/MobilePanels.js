"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NavigationSlideContext } from "@/lib/navigation-slide";
import styles from "./chat.module.css";

// Two-pane chat works side by side on wide screens. On small screens (<900px)
// the thread panel slides *over* the conversation rail (WhatsApp/Slack style):
// - arriving on a conversation animates the thread in from the right
// - the header's back chevron slides it back out before navigating to the rail
// The slide classes are always applied — CSS scoped to the mobile media query
// decides whether they act, so server and client render the same DOM.
export default function MobilePanels({ activeId, backHref, rail, thread, empty }) {
  const router = useRouter();
  const [open, setOpen] = useState(!activeId);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Slide-in on arrival when the thread is active on a mobile viewport. The
  // first paint shows the rail behind; the next frame slides the thread over.
  // (open already defaults to false for an active conversation, so only the
  // rAF flip is needed below — never a synchronous setState in the effect.)
  useEffect(() => {
    if (!activeId || !isMobile) return undefined;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    return () => cancelAnimationFrame(raf);
  }, [activeId, isMobile]);

  const timerRef = useRef(null);

  const slideBack = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isMobile) {
      router.push(backHref);
      return;
    }
    setOpen(false);
    timerRef.current = window.setTimeout(() => router.push(backHref), 280);
  }, [backHref, isMobile, router]);

  const contextValue = useMemo(() => ({ slideBack }), [slideBack]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const threadPaneClass = `${styles.threadPane} ${activeId ? styles.threadPaneSlide : ""} ${open && activeId ? styles.threadPaneOpen : ""}`;

  return (
    <NavigationSlideContext.Provider value={contextValue}>
      <div className={styles.twoPane}>
        {rail}
        {activeId ? <section className={threadPaneClass}>{thread}</section> : <section className={styles.threadPane}>{empty}</section>}
      </div>
    </NavigationSlideContext.Provider>
  );
}