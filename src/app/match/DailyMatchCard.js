import Image from "next/image";
import Link from "next/link";
import { HeartHandshake, MessageCircle, Check, X, Sparkles } from "lucide-react";
import styles from "./match.module.css";
import { initialsFor } from "./match-utils";

export default function DailyMatchCard({ dailyMatch, dailyDecision, onDecision, dailyLoading, dailyError }) {
  async function decide(decision) {
    try {
      const res = await fetch("/api/members/blind-date/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save your decision");
      onDecision?.(data.decision?.decision || decision);
    } catch {
      // Keep the card stable; the next refresh will show the persisted state.
    }
  }
  return (
    <section className={styles.matchCard} aria-labelledby="daily-blind-date-title">
      <div className={styles.matchCardHeader}>
        <span className={styles.matchCardIcon}>
          <HeartHandshake size={20} />
        </span>
        <div>
          <p className={styles.matchKicker}>Lounge Matchmaker</p>
          <h2 id="daily-blind-date-title" className={styles.matchCardTitle}>Daily Blind Date</h2>
        </div>
      </div>
      <div className={styles.matchCardImage}>
        <Image
          src="/images/match/crochet-matchmaking-app.jpg"
          alt="Crocheter profile cards ready to match"
          fill
          sizes="(max-width: 640px) 100vw, 920px"
        />
      </div>
      <div className={styles.matchCardBody}>
        <p className={styles.matchCardDesc}>
          One curated match every 24 hours based on your fiber interests, crafts, and hobbies.
        </p>
        {dailyLoading ? (
          <p className={styles.statusLine}>Finding today&apos;s match…</p>
        ) : dailyError ? (
          <p className={styles.error}>{dailyError}</p>
        ) : dailyMatch ? (
          <div className={styles.matchPreviewCard}>
            <div className={styles.matchPreview}>
              {dailyMatch.photoURL ? (
                <Image
                  src={dailyMatch.photoURL}
                  alt={dailyMatch.memberName || "Today's fiber match"}
                  width={64}
                  height={64}
                  className={styles.matchAvatar}
                />
              ) : (
                <div className={styles.matchAvatarPlaceholder} aria-hidden="true">
                  {initialsFor(dailyMatch.memberName)}
                </div>
              )}
              <div className={styles.matchIdentity}>
                <div className={styles.matchName}>{dailyMatch.memberName || "Member"}</div>
                {dailyMatch.headline && <div className={styles.matchHeadline}>{dailyMatch.headline}</div>}
              </div>
            </div>
            {dailyDecision === "passed" ? (
              <p className={styles.statusLine}>You passed today&apos;s match. A new match arrives tomorrow.</p>
            ) : (
              <div className={styles.matchActions}>
                {dailyDecision === "accepted" ? (
                  <span className={styles.primaryBtn}><Check size={15} /> Match accepted</span>
                ) : (
                  <>
                    <button type="button" className={styles.primaryBtn} onClick={() => decide("accepted")}>
                      <Check size={15} /> Accept match
                    </button>
                    <button type="button" className={styles.secondaryBtn} onClick={() => decide("passed")}>
                      <X size={15} /> Pass
                    </button>
                  </>
                )}
                <Link href={`/members/${dailyMatch.memberId}`} className={styles.secondaryBtn}>
                  View profile
                </Link>
                <Link href={`/chat?with=${dailyMatch.memberId}`} className={styles.secondaryBtn}>
                  <MessageCircle size={15} /> Say hello
                </Link>
              </div>
            )}
            <p className={styles.matchNote}><Sparkles size={13} /> One new curated profile every 24 hours.</p>
          </div>
        ) : (
          <p className={styles.statusLine}>No match yet — check back tomorrow.</p>
        )}
      </div>
    </section>
  );
}
