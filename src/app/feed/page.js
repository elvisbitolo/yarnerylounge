import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { recordDailyVisit } from "@/lib/server/gamification";
import { loungeGate } from "@/lib/server/lounge-gate";
import Nav from "@/components/Nav";
import Feed from "./Feed";
import styles from "./feed.module.css";

export const dynamic = "force-dynamic";

export default async function FeedPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const params = await searchParams;
  const initialKind = params?.kind || "";

  const gate = await loungeGate(user.uid, userDoc);
  if (gate) redirect(gate);

  recordDailyVisit(user.uid, userDoc?.name || user.name || "Member").catch(() => {});

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Feed</h1>
        <p className={styles.subtitle}>Conversations between video sessions.</p>
        <Feed
          uid={user.uid}
          userName={userDoc?.name || user.name || "Member"}
          role={userDoc?.role || "member"}
          initialKind={initialKind}
        />
      </div>
</Nav>
  );
}
