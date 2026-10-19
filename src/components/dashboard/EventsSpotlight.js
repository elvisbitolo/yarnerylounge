"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cardThemeVars } from "@/lib/card-themes";
import { formatClock, formatDay } from "@/lib/calendar-core";
import { recurringShortLabel } from "@/lib/server/availability-core";
import styles from "./dashboard.module.css";

// The viewer's zone, resolved the same way ViewerTime does it: a per-viewer
// runtime fact read during render, never guessed by the server.
function subscribe() {
  return () => {};
}

function viewerZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function EventsSpotlight({ data }) {
  const t = useTranslations("dashboard");
  const zone = useSyncExternalStore(subscribe, viewerZone, () => "UTC");
  // Collapsed by default: the band sits at the top of the dashboard, and a full
  // rail of cards there pushes the rest of the page below the fold. The header
  // keeps the count so the state is still legible at a glance.
  const [open, setOpen] = useState(false);

  const events = data?.events || [];
  const pinned = data?.pinnedBlocks || [];
  const myBlocks = data?.myBlocks || [];
  const recent = data?.recent || [];
  const attending = events.length + pinned.length;
  const empty = attending === 0 && myBlocks.length === 0;
  // The chip drives discovery of the folded band, so it counts everything the
  // band would reveal -- including the history row, which is the only section
  // some members have.
  const badge = attending + myBlocks.length + recent.length;

  const blockWhen = (startAt, endAt, timeZone) => (
    <span className={styles.spotWhen}>
      <span className={styles.spotDay}>{formatDay(startAt, timeZone || zone)}</span>
      <span className={styles.spotTime}>
        {formatClock(startAt, timeZone || zone)}
        {endAt ? ` – ${formatClock(endAt, timeZone || zone)}` : ""}
      </span>
    </span>
  );

  return (
    <section
      className={`${styles.card} ${styles.spotlight}`}
      style={cardThemeVars("rose", { light: true })}
      aria-labelledby="whats-on-title"
    >
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle} id="whats-on-title">
          {t("whatsOn")}
          {badge > 0 && <span className={styles.spotCount}>{badge}</span>}
        </h2>
        <div className={styles.spotHeadActions}>
          <Link className={styles.cardLink} href="/events">
            {t("seeAllEvents")}
          </Link>
          <button
            type="button"
            className={styles.spotToggle}
            aria-expanded={open}
            aria-controls="whats-on-body"
            aria-label={open ? t("hideWhatsOn") : t("showWhatsOn")}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown
              size={16}
              className={open ? styles.spotChevronOpen : styles.spotChevron}
            />
          </button>
        </div>
      </div>

      {open && (
        <div id="whats-on-body">
          {empty ? (
            <div className={styles.spotEmpty}>
              <p className={styles.spotEmptyText}>{t("noEventsYet")}</p>
              <Link className={styles.spotCta} href="/calendar">
                {t("postAvailability")}
              </Link>
            </div>
          ) : (
            <>
              {events.length > 0 && (
                <div className={styles.spotRail}>
                  {events.map((event) => (
                    <Link key={event.id} className={styles.spotCard} href={event.href}>
                      {blockWhen(event.startTime, event.endTime, zone)}
                      <span className={styles.spotTitle}>{event.title}</span>
                      <span className={styles.spotMeta}>
                        {event.rsvpCount > 0
                          ? t("rsvps", { count: event.rsvpCount })
                          : event.roomName || t("meetup")}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {pinned.length > 0 && (
                <div className={styles.spotSection}>
                  <h3 className={styles.spotSectionTitle}>{t("pinned")}</h3>
                  <div className={styles.spotRail}>
                    {pinned.map((block) => (
                      <Link
                        key={block.id}
                        className={`${styles.spotCard} ${styles.spotPinned}`}
                        href="/calendar"
                      >
                        <span className={styles.spotKicker}>
                          {block.isMine
                            ? t("pinnedByYou")
                            : t("pinnedBy", { name: block.hostName || t("member") })}
                        </span>
                        {blockWhen(block.startAt, block.endAt, block.timeZone)}
                        <span className={styles.spotTitle}>{block.title}</span>
                        <span className={styles.spotMeta}>
                          {block.roomName ||
                            (block.recurring !== "none"
                              ? recurringShortLabel(block.recurring)
                              : t("availabilityTag"))}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {myBlocks.length > 0 && (
                <div className={styles.spotSection}>
                  <h3 className={styles.spotSectionTitle}>{t("yourNextBlock")}</h3>
                  <div className={styles.spotRail}>
                    {myBlocks.map((block) => (
                      <Link
                        key={block.id}
                        className={`${styles.spotCard} ${styles.spotCardMine}`}
                        href="/calendar"
                      >
                        {blockWhen(block.startAt, block.endAt, block.timeZone)}
                        <span className={styles.spotTitle}>{block.title}</span>
                        <span className={styles.spotMeta}>
                          {block.recurring !== "none"
                            ? recurringShortLabel(block.recurring)
                            : t("availabilityTag")}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {recent.length > 0 && (
                <div className={styles.spotSection}>
                  <h3 className={styles.spotSectionTitle}>{t("recentlyHappened")}</h3>
                  <ul className={styles.spotRecent}>
                    {recent.map((item) => (
                      <li key={item.id}>
                        <Link className={styles.spotRecentItem} href={item.href}>
                          <span className={styles.spotDay}>
                            {formatDay(item.startTime, zone)}
                          </span>
                          <span className={styles.spotTitle}>{item.title}</span>
                          <span className={styles.spotMeta}>
                            {item.hostName || item.roomName || ""}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.spotFoot}>
                <Link className={styles.spotCta} href="/calendar">
                  {t("postAvailability")}
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
