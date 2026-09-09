import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { loungeGate } from "@/lib/server/lounge-gate";
import Nav from "@/components/Nav";
import MatchDashboard from "./MatchDashboard";
import styles from "./match.module.css";

export const dynamic = "force-dynamic";

export default async function MatchPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const caps = await getCapabilities(user.uid);
  const matchmakerEnabled = canUseMatchmaker(caps);

  const gate = await loungeGate(user.uid, userDoc);
  if (gate) redirect(gate);

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Find Your Fiber Match</h1>
          <p className={styles.subtitle}>
            Discover crafters who share your fiber interests, skill level, and creative vibe
          </p>
        </div>
        <MatchDashboard matchmakerEnabled={matchmakerEnabled} />
      </div>
    </Nav>
  );
}
