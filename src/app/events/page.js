import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listEvents, expandEvents } from "@/lib/server/events";
import Nav from "@/components/Nav";
import EventsBoard from "./EventsBoard";
import styles from "./events.module.css";

export const dynamic = "force-dynamic";

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

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Events</h1>
          {userDoc?.role === "owner" && (
            <a className={styles.adminLink} href="/admin/events">Manage events</a>
          )}
        </div>
        <p className={styles.subtitle}>Scheduled meetups for the community. RSVP and get the lounge link.</p>
        <EventsBoard
          events={serialized}
          uid={user.uid}
          userName={userDoc?.name || user.name || "Member"}
        />
      </div>
</Nav>
  );
}
