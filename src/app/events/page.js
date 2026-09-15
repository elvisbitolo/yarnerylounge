import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listEvents, expandEvents } from "@/lib/server/events";
import { listAvailability, nextOccurrenceAt } from "@/lib/server/availability";
import Nav from "@/components/Nav";
import EventsBoard from "./EventsBoard";
import styles from "./events.module.css";

export const dynamic = "force-dynamic";

function formatWhen(iso) {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatWhenShort(iso) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function EventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const events = await listEvents();
  const expanded = expandEvents(events);
  const serialized = expanded.map((event) => ({
    id: event.id,
    occurrenceId: event.occurrenceId,
    title: event.title,
    description: event.description || "",
    startTime: event.startTime instanceof Date
      ? event.startTime.toISOString()
      : new Date(event.startTime.toMillis ? event.startTime.toMillis() : event.startTime).toISOString(),
    endTime: event.endTime ? new Date(event.endTime.toMillis ? event.endTime.toMillis() : event.endTime).toISOString() : null,
    roomSlug: event.roomSlug || "",
    capacity: Number(event.capacity) || 0,
    purchasePriceCents: Number(event.purchasePriceCents) || 0,
    occurrenceIndex: Number(event.occurrenceIndex) || 0,
  }));

  const now = new Date();
  const hangouts = (await listAvailability({}))
    .map((slot) => ({ ...slot, nextAt: nextOccurrenceAt(slot, now) }))
    .filter((slot) => slot.nextAt)
    .sort((a, b) => new Date(a.nextAt) - new Date(b.nextAt))
    .slice(0, 12);

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Events</h1>
          {userDoc?.role === "owner" && (
            <a className={styles.adminLink} href="/admin/events">Manage events</a>
          )}
        </div>
        <p className={styles.subtitle}>Scheduled meetups and hangouts for the community. RSVP and get the lounge link.</p>
        {hangouts.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Upcoming hangouts</h2>
              <Link className={styles.calendarLink} href="/calendar">Add your availability</Link>
            </div>
            <div className={styles.list}>
              {hangouts.map((slot) => (
                <div key={slot.id} className={styles.hangoutCard} style={{ borderLeftColor: slot.color }}>
                  <div className={styles.hangoutBody}>
                    <div className={styles.hangoutRow}>
                      <h3 className={styles.hangoutTitle}>{slot.title}</h3>
                      {slot.recurring === "weekly" && (
                        <span className={`${styles.tag} ${styles.tagRepeat}`}>Weekly</span>
                      )}
                    </div>
                    <p className={styles.hangoutWhen}>{formatWhen(slot.nextAt)}</p>
                    <p className={styles.hangoutNote}>
                      {slot.userAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={styles.hangoutAvatar} src={slot.userAvatar} alt="" />
                      ) : (
                        <span className={styles.hangoutAvatarFallback}>
                          {(slot.userName || "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span>{slot.userName}</span>
                      {slot.roomSlug && (
                        <>
                          <span className={styles.hangoutDot}>·</span>
                          <Link className={styles.hangoutRoom} href={`/rooms/${slot.roomSlug}`}>
                            {slot.roomName}
                          </Link>
                        </>
                      )}
                      {slot.rsvpCount > 0 && (
                        <>
                          <span className={styles.hangoutDot}>·</span>
                          <span>{slot.rsvpCount} stitching</span>
                        </>
                      )}
                    </p>
                    {slot.note && <p className={styles.hangoutNoteText}>{slot.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Scheduled meetups</h2>
          <EventsBoard
            events={serialized}
            uid={user.uid}
            userName={userDoc?.name || user.name || "Member"}
          />
        </section>
      </div>
    </Nav>
  );
}
