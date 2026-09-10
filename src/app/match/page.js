import { redirect } from "next/navigation";
import Image from "next/image";
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
          <div className={styles.headerCopy}>
            <h1 className={styles.title}>Find Your Fiber Match</h1>
            <p className={styles.subtitle}>
              Discover crafters who share your fiber interests, skill level, and creative vibe
            </p>
          </div>
          <div className={styles.headerArt} aria-hidden="true">
            <div className={styles.headerArtItem}>
              <Image
                src="/images/match/crafting-profile-matches.jpg"
                alt=""
                fill
                sizes="(max-width: 700px) 50vw, 180px"
                priority
              />
            </div>
            <div className={styles.headerArtItem}>
              <Image
                src="/images/match/global-friends-map.jpg"
                alt=""
                fill
                sizes="(max-width: 700px) 50vw, 180px"
              />
            </div>
          </div>
        </div>
        <MatchDashboard matchmakerEnabled={matchmakerEnabled} />
      </div>
    </Nav>
  );
}
