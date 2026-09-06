import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { loungeGate } from "@/lib/server/lounge-gate";
import Nav from "@/components/Nav";
import MatchmakerCalendar from "./MatchmakerCalendar";
import styles from "./calendar.module.css";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const gate = await loungeGate(user.uid, userDoc, { matchmaker: true });
  if (gate) redirect(gate);

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Matchmaker Calendar</h1>
        <p className={styles.subtitle}>
          Post when you&apos;ll be online, scout your favorite crowd&apos;s plans, and stitch along with members around the clock.
        </p>
        <MatchmakerCalendar
          userId={user.uid}
          userName={userDoc?.name || user.displayName || "Member"}
          userAvatar={userDoc?.avatar || user.photoURL || ""}
        />
      </div>
    </Nav>
  );
}