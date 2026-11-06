import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import {
  getGamification,
  getLeaderboard,
  getWeeklyLeaderboard,
  BADGES,
} from "@/lib/server/gamification";
import { getRecognitionLeaderboard } from "@/lib/server/recognition";
import styles from "./leaderboard.module.css";
import { Flame, Lock, Trophy, Sparkles, Medal, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

function MemberIdentity({ entry }) {
  return (
    <span className={styles.memberIdentity}>
      {entry.photoURL ? (
        <Image
          src={entry.photoURL}
          alt=""
          width={42}
          height={42}
          unoptimized
          className={styles.avatar}
        />
      ) : (
        <span className={styles.avatarFallback}>
          {(entry.name || "M").trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className={styles.memberText}>
        <span className={styles.memberName}>{entry.name}</span>
        {entry.username && <span className={styles.username}>@{entry.username}</span>}
      </span>
    </span>
  );
}

function Podium({ entries }) {
  if (!entries.length) return null;
  const order = [entries[1], entries[0], entries[2]].filter(Boolean);
  return (
    <div className={styles.podium}>
      {order.map((entry) => (
        <Link
          href={`/members/${entry.userId}`}
          key={entry.userId}
          className={`${styles.podiumCard} ${entry.rank === 1 ? styles.firstPlace : ""}`}
        >
          <span className={styles.podiumMedal}>
            {entry.rank === 1 ? <Trophy size={20} /> : <Medal size={18} />}
          </span>
          <MemberIdentity entry={entry} />
          <strong className={styles.podiumPoints}>{entry.points.toLocaleString()} pts</strong>
          <span className={styles.podiumRank}>#{entry.rank}</span>
        </Link>
      ))}
    </div>
  );
}

function RankingRows({ entries, currentUserId, mode = "points" }) {
  if (!entries.length) {
    return <p className={styles.empty}>No rankings yet. Start contributing to appear here.</p>;
  }
  return (
    <div className={styles.rows}>
      {entries.map((entry) => (
        <div
          key={entry.userId}
          className={entry.userId === currentUserId ? `${styles.row} ${styles.rowMine}` : styles.row}
        >
          <span className={styles.rank}>#{entry.rank}</span>
          <Link className={styles.memberLink} href={`/members/${entry.userId}`}>
            <MemberIdentity entry={entry} />
          </Link>
          {mode === "allTime" && (
            <span className={styles.meta}><Flame size={14} /> {entry.streak} day streak</span>
          )}
          {mode === "allTime" && <span className={styles.meta}>{entry.badgeCount} badges</span>}
          <strong className={styles.points}>
            {entry.points.toLocaleString()} <small>pts</small>
          </strong>
          {entry.userId === currentUserId && <span className={styles.youTag}>YOU</span>}
        </div>
      ))}
    </div>
  );
}

export default async function LeaderboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const name = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";
  const [rawMine, leaderboard, weekly, recognized] = await Promise.all([
    getGamification(user.uid, name),
    getLeaderboard(20, user.uid),
    getWeeklyLeaderboard(20),
    getRecognitionLeaderboard(20),
  ]);
  const mine = rawMine ?? { points: 0, streak: 0, bestStreak: 0, badges: {} };
  const myRank = leaderboard.find((entry) => entry.userId === user.uid)?.rank || null;
  const earnedCodes = Object.keys(mine.badges || {});
  const earnedCount = earnedCodes.length;
  const nextBadge = Object.entries(BADGES).find(([code]) => !earnedCodes.includes(code));
  const nextBadgeName = nextBadge?.[1]?.name || "All badges earned";
  const topThree = leaderboard.slice(0, 3);
  const pointsToNextRank = myRank && myRank > 1 && myRank <= 20
    ? Math.max(0, (leaderboard[myRank - 2]?.points || mine.points) - mine.points + 1)
    : null;

  return (
    <main className={styles.container}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}><Sparkles size={14} /> COMMUNITY RECOGNITION</span>
        <h1 className={styles.title}>Celebrate the people who make this community.</h1>
        <p className={styles.subtitle}>
          Every post, helpful comment, lesson, event and daily visit moves the community forward.
          Show up, share what you know and recognise one another.
        </p>
      </header>

      <section className={styles.statsCard} aria-label="Your community progress">
        <div className={styles.stat}>
          <span className={styles.statLabel}>Your points</span>
          <strong className={styles.statValue}>{mine.points.toLocaleString()}</strong>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Current streak</span>
          <strong className={styles.statValue}>{mine.streak} <small>{mine.streak === 1 ? "day" : "days"}</small></strong>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Best streak</span>
          <strong className={styles.statValue}>{mine.bestStreak} <small>{mine.bestStreak === 1 ? "day" : "days"}</small></strong>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>All-time rank</span>
          <strong className={styles.statValue}>{myRank ? `#${myRank}` : "—"}</strong>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Badges earned</span>
          <strong className={styles.statValue}>{earnedCount}<small> / {Object.keys(BADGES).length}</small></strong>
        </div>
      </section>

      {myRank && pointsToNextRank !== null && (
        <aside className={styles.progressCallout}>
          <TrendingUp size={18} />
          <span>You’re <strong>{pointsToNextRank} points</strong> away from moving up one place.</span>
        </aside>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>THE COMMUNITY&apos;S TOP CONTRIBUTORS</span><h2>All-time leaders</h2></div>
          <span className={styles.sectionNote}>Ranked by lifetime points</span>
        </div>
        <Podium entries={topThree} />
        <RankingRows entries={leaderboard} currentUserId={user.uid} mode="allTime" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>A FRESH START EVERY WEEK</span><h2>Weekly leaders</h2></div>
          <span className={styles.sectionNote}>Points earned since Monday (UTC)</span>
        </div>
        {weekly.length ? (
          <RankingRows entries={weekly} currentUserId={user.uid} />
        ) : (
          <p className={styles.empty}>Weekly rankings start collecting points after the point-tracking update goes live. Your new activity will count here.</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>COMMUNITY APPRECIATION</span><h2>Most recognized</h2></div>
          <span className={styles.sectionNote}>Peer recognitions received</span>
        </div>
        {recognized.length ? (
          <div className={styles.rows}>
            {recognized.map((entry) => (
              <div key={entry.userId} className={entry.userId === user.uid ? `${styles.row} ${styles.rowMine}` : styles.row}>
                <span className={styles.rank}>#{entry.rank}</span>
                <Link className={styles.memberLink} href={`/members/${entry.userId}`}>
                  <MemberIdentity entry={entry} />
                </Link>
                <span className={styles.recognitionCount}>{entry.count} <small>{entry.count === 1 ? "recognition" : "recognitions"}</small></span>
                {entry.userId === user.uid && <span className={styles.youTag}>YOU</span>}
              </div>
            ))}
          </div>
        ) : <p className={styles.empty}>No recognitions yet. Visit a member profile to appreciate someone in the community.</p>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>MILESTONES & ACHIEVEMENTS</span><h2>Your badges</h2></div>
          <span className={styles.sectionNote}>{earnedCount} of {Object.keys(BADGES).length} unlocked</span>
        </div>
        {nextBadge && (
          <div className={styles.nextBadge}>
            <Sparkles size={18} />
            <span>Next achievement to unlock: <strong>{nextBadgeName}</strong> — {nextBadge[1].description}.</span>
          </div>
        )}
        <div className={styles.badgeGrid}>
          {Object.entries(BADGES).map(([code, badge]) => {
            const earned = Boolean(mine.badges?.[code]);
            const earnedAt = mine.badges?.[code]?.earnedAt;
            const earnedDate = earnedAt ? new Date(earnedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : null;
            return (
              <article key={code} className={earned ? styles.badge : `${styles.badge} ${styles.badgeLocked}`}>
                <span className={styles.badgeIcon}>{earned ? <Medal size={21} /> : <Lock size={18} />}</span>
                <div><h3 className={styles.badgeName}>{badge.name}</h3><p className={styles.badgeDesc}>{badge.description}</p></div>
                <span className={styles.badgeStatus}>{earned ? (earnedDate ? `Earned ${earnedDate}` : "Earned") : "Not yet unlocked"}</span>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
