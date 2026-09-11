import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getGamification, getLeaderboard, BADGES } from "@/lib/server/gamification";
import { getRecognitionLeaderboard } from "@/lib/server/recognition";
import Nav from "@/components/Nav";
import styles from "./leaderboard.module.css";
import { Flame, PartyPopper, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const name = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";
  const [mine, leaderboard, recognized] = await Promise.all([
    getGamification(user.uid, name),
    getLeaderboard(20),
    getRecognitionLeaderboard(20),
  ]);

  const myRank = leaderboard.find((entry) => entry.userId === user.uid)?.rank || null;
  const earnedCodes = Object.keys(mine.badges || {});
  const unearned = Object.entries(BADGES).filter(([code]) => !earnedCodes.includes(code));

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Leaderboard</h1>
        <p className={styles.subtitle}>
          Earn points by posting, commenting, attending events and finishing lessons.
        </p>

        <div className={styles.statsCard}>
          <div className={styles.stat}>
            <p className={styles.statValue}>{mine.points}</p>
            <p className={styles.statLabel}>Points</p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statValue}>{mine.streak} {mine.streak === 1 ? "day" : "days"}</p>
            <p className={styles.statLabel}>Current streak</p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statValue}>{mine.bestStreak} {mine.bestStreak === 1 ? "day" : "days"}</p>
            <p className={styles.statLabel}>Best streak</p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statValue}>{myRank ? `#${myRank}` : "—"}</p>
            <p className={styles.statLabel}>Your rank</p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statValue}>{earnedCodes.length}</p>
            <p className={styles.statLabel}>Badges</p>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>Top 20 members</h2>
        <p className={styles.subtitle}>Ranked by all-time points.</p>
        <div className={styles.rows}>
          {leaderboard.map((entry) => (
            <div
              key={entry.userId}
              className={entry.userId === user.uid ? `${styles.row} ${styles.rowMine}` : styles.row}
            >
              <p className={styles.rank}>#{entry.rank}</p>
              <Link className={styles.nameLink} href={`/members/${entry.userId}`}>
                {entry.name}
              </Link>
              <p className={styles.streak}>{entry.streak} <Flame size={14} /></p>
              <p className={styles.badges}>{entry.badgeCount} badges</p>
              <p className={styles.points}>{entry.points} pts</p>
            </div>
          ))}
          {leaderboard.length === 0 && <p className={styles.empty}>No points yet — be the first!</p>}
        </div>

        <h2 className={styles.sectionTitle}>Most recognized</h2>
        <p className={styles.subtitle}>Members who received the most peer recognitions.</p>
        <div className={styles.rows}>
          {recognized.map((entry) => (
            <div
              key={entry.userId}
              className={entry.userId === user.uid ? `${styles.row} ${styles.rowMine}` : styles.row}
            >
              <p className={styles.rank}>#{entry.rank}</p>
              <Link className={styles.nameLink} href={`/members/${entry.userId}`}>
                {entry.name}
              </Link>
              <p className={styles.badges}>
                {entry.count === 1 ? "1 recognition" : `${entry.count} recognitions`}
              </p>
              <p className={styles.points}>{entry.count} <PartyPopper size={14} /></p>
            </div>
          ))}
          {recognized.length === 0 && (
            <p className={styles.empty}>No recognitions yet — recognize a member on their profile!</p>
          )}
        </div>

        <h2 className={styles.sectionTitle}>Badges</h2>
        <div className={styles.badges}>
          {Object.entries(BADGES).map(([code, badge]) => {
            const earned = mine.badges[code];
            return (
              <div key={code} className={earned ? styles.badge : `${styles.badge} ${styles.badgeLocked}`}>
                <p className={styles.badgeName}>{earned ? "✓" : <Lock size={13} />} {badge.name}</p>
                <p className={styles.badgeDesc}>{badge.description}</p>
              </div>
            );
          })}
          {unearned.length === 0 && <p className={styles.empty}>All badges earned!</p>}
        </div>
      </div>
</Nav>
  );
}
