"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  const events = data?.events || [];
  const myBlocks = data?.myBlocks || [];
  const empty = events.length === 0 && myBlocks.length === 0;

  return (
    <section
      className={`${styles.card} ${styles.spotlight}`}
      style={cardThemeVars("rose", { light: true })}
      aria-labelledby="whats-on-title"
    >
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle} id="whats-on-title">
          {t("whatsOn")}
        </h2>
        <div className={styles.cardHeaderActions}>
          <Link className={styles.cardLink} href="/calendar">
            {t("openCalendar")}
          </Link>
          <Link className={styles.cardLink} href="/events">
            {t("seeAllEvents")}
          </Link>
        </div>
      </div>

      {empty ? (
        <div className={styles.spotEmpty}>
          <p className={styles.spotEmptyText}>{t("noEventsYet")}</p>
          <Link className={styles.spotCta} href="/calendar">
            {t("postAvailability")}
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.spotRail}>
            {events.map((event) => (
              <Link key={event.id} className={styles.spotCard} href={event.href}>
                <span className={styles.spotWhen}>
                  <span className={styles.spotDay}>{formatDay(event.startTime, zone)}</span>
                  <span className={styles.spotTime}>
                    {formatClock(event.startTime, zone)}
                    {event.endTime ? ` – ${formatClock(event.endTime, zone)}` : ""}
                  </span>
                </span>
                <span className={styles.spotTitle}>{event.title}</span>
                <span className={styles.spotMeta}>
                  {event.rsvpCount > 0
                    ? t("rsvps", { count: event.rsvpCount })
                    : event.roomName || t("meetup")}
                </span>
              </Link>
            ))}
            {myBlocks.map((block) => (
              <Link
                key={`block-${block.id}`}
                className={`${styles.spotCard} ${styles.spotCardMine}`}
                href="/calendar"
              >
                <span className={styles.spotKicker}>{t("yourNextBlock")}</span>
                <span className={styles.spotWhen}>
                  <span className={styles.spotDay}>
                    {formatDay(block.startAt, block.timeZone || zone)}
                  </span>
                  <span className={styles.spotTime}>
                    {formatClock(block.startAt, block.timeZone || zone)}
                    {block.endAt ? ` – ${formatClock(block.endAt, block.timeZone || zone)}` : ""}
                  </span>
                </span>
                <span className={styles.spotTitle}>{block.title}</span>
                <span className={styles.spotMeta}>
                  {block.recurring !== "none"
                    ? recurringShortLabel(block.recurring)
                    : t("availabilityTag")}
                </span>
              </Link>
            ))}
          </div>
          <div className={styles.spotFoot}>
            <Link className={styles.spotCta} href="/calendar">
              {t("postAvailability")}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
