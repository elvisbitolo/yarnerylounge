import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getEvent, expandEvents } from "@/lib/server/events";
import BackButton from "@/components/BackButton";
import EventDetail from "./EventDetail";
import styles from "../events.module.css";

export const dynamic = "force-dynamic";

function toMillis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  return new Date(value).getTime();
}

function getNow() {
  return Date.now();
}

export default async function EventPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const event = await getEvent(id);
  if (!event) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Event not found</h1>
          <p className={styles.subtitle}>This event is closed or doesn&apos;t exist.</p>
          <Link className={styles.adminLink} href="/events">Back to events</Link>
        </div>
      </main>
    );
  }

  const now = getNow();
  let display = event;
  if (toMillis(event.startTime) <= now) {
    const expanded = expandEvents([event]);
    const next =
      expanded.find((e) => toMillis(e.startTime) > now) || expanded[0] || event;
    display = next;
  }

  const serialized = {
    id: display.id,
    occurrenceId: display.occurrenceId || "",
    title: display.title,
    description: display.description || "",
    startTime: new Date(toMillis(display.startTime)).toISOString(),
    endTime: display.endTime ? new Date(toMillis(display.endTime)).toISOString() : null,
    roomSlug: display.roomSlug || "",
    capacity: Number(display.capacity) || 0,
    purchasePriceCents: Number(display.purchasePriceCents) || 0,
    recurrence: event.recurrence || null,
  };

  return (
      <div className={styles.container}>
        <BackButton fallback="/events" label="All events" />
        <EventDetail
          event={serialized}
          uid={user.uid}
          userName={userDoc?.name || user.name || "Member"}
        />
      </div>
  );
}
