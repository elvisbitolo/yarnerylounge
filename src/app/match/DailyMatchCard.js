import Image from "next/image";
import Link from "next/link";
import { HeartHandshake, MessageCircle, Sparkles } from "lucide-react";
import MemberBadge from "@/components/MemberBadge";
import styles from "./match.module.css";
import { initialsFor } from "./match-utils";

export default function DailyMatchCard({ dailyMatch, dailyLoading, dailyError }) {
  const expiresAt = dailyMatch?.expiresAt ? new Date(dailyMatch.expiresAt) : null;
  return (
    <section className={styles.matchCard} aria-labelledby="daily-blind-date-title">
      <div className={styles.matchCardHeader}>
        <span className={styles.matchCardIcon}>
          <HeartHandshake size={20} />
        </span>
        <div>
          <p className={styles.matchKicker}>Speakeasy Matchmaker</p>
          <h2 id="daily-blind-date-title" className={styles.matchCardTitle}>Today&apos;s Curated Match</h2>
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
            <p className={styles.matchWindow}>
              Private for you · Available until{" "}
              {expiresAt && !Number.isNaN(expiresAt.getTime())
                ? expiresAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
                : "the end of this 24-hour window"}
            </p>
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
                <div className={styles.matchName}>
                  {dailyMatch.memberName || "Member"}
                  <MemberBadge plan={dailyMatch.plan} role={dailyMatch.role} size={12} tooltip={false} />
                </div>
                {dailyMatch.headline && <div className={styles.matchHeadline}>{dailyMatch.headline}</div>}
              </div>
            </div>
            {dailyMatch.lifestyleTags?.length > 0 && (
              <div className={styles.matchLifestyle}>
                <h3>Shared interests & lifestyle</h3>
                <ul>
                  {dailyMatch.lifestyleTags.map((tag) => <li key={tag}>{tag}</li>)}
                </ul>
              </div>
            )}
            {dailyMatch.projects?.length > 0 && (
              <div className={styles.matchProjects}>
                <h3>Active projects</h3>
                <ul>
                  {dailyMatch.projects.map((project) => (
                    <li key={project.id} className={styles.matchProject}>
                      {project.imageUrls?.[0] && (
                        // Project photos can be user-hosted URLs or data URLs.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={project.imageUrls[0]}
                          alt=""
                          className={styles.matchProjectImage}
                        />
                      )}
                      <span>
                        <strong>{project.title}</strong>
                        {(project.craft || project.projectType) && (
                          <small>{[project.craft, project.projectType].filter(Boolean).join(" · ")}</small>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className={styles.matchActions}>
              <Link href={`/chat?with=${dailyMatch.memberId}`} className={styles.primaryBtn}>
                <MessageCircle size={15} /> Say hello
              </Link>
              <Link href={`/members/${dailyMatch.memberId}`} className={styles.secondaryBtn}>
                View full profile
              </Link>
            </div>
            <p className={styles.matchNote}><Sparkles size={13} /> No pressure to respond. If you don&apos;t connect, this match quietly expires.</p>
          </div>
        ) : (
          <p className={styles.statusLine}>No match yet — check back tomorrow.</p>
        )}
      </div>
    </section>
  );
}
