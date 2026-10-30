import Link from "next/link";
import { Users, MessageCircle } from "lucide-react";
import MemberBadge from "@/components/MemberBadge";
import styles from "./match.module.css";
import { initialsFor } from "./match-utils";

export default function SimilarMembersCard({ similarMembers, topMatches, similarLoading, similarError }) {
  return (
    <section className={styles.matchCard} aria-labelledby="similar-members-title">
      <div className={styles.matchCardHeader}>
        <div className={styles.matchCardHeading}>
          <p className={styles.matchKicker}>Fiber interests · hook size · yarn taste</p>
          <h2 id="similar-members-title" className={styles.matchCardTitle}>Members Like You</h2>
          <p className={styles.matchCardDesc}>
            Browse crafters who share your favorite yarns, hook sizes, and creative interests.
          </p>
        </div>
      </div>
      <div className={styles.matchCardBody}>
        {similarLoading ? (
          <p className={styles.statusLine}>Finding members like you…</p>
        ) : similarError ? (
          <p className={styles.error}>{similarError}</p>
        ) : topMatches.length === 0 ? (
          <p className={styles.statusLine}>Complete your profile for closer fiber matches.</p>
        ) : (
          <>
            <p className={styles.matchCount}>{similarMembers.length} crafters found</p>
            <ul className={styles.matchGrid}>
              {topMatches.map((member) => (
                <li key={member.id} className={styles.matchTile}>
                  <Link href={`/members/${member.id}`} className={styles.matchTileLink}>
                    {member.photoURL ? (
                      <>
                      <Image
                        src={member.photoURL}
                        alt={member.name || "Member"}
                        width={72}
                        height={72}
                        className={styles.matchTilePhoto}
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                          const fallback = event.currentTarget.nextElementSibling;
                          if (fallback) fallback.hidden = false;
                        }}
                      />
                      <span className={styles.matchTileInitials} aria-hidden="true" hidden>
                        {initialsFor(member.name)}
                      </span>
                    </>
                    ) : (
                      <span className={styles.matchTileInitials} aria-hidden="true">
                        {initialsFor(member.name)}
                      </span>
                    )}
                    <span className={styles.matchTileName}>
                      {member.name || "Member"}
                      <MemberBadge plan={member.plan} role={member.role} size={12} tooltip={false} />
                    </span>
                    {typeof member.score === "number" && (
                      <span className={styles.matchScore}>{member.score}% match</span>
                    )}
                  </Link>
                  <Link href={`/chat?with=${member.id}`} className={styles.tileAction}>
                    <MessageCircle size={14} /> Join
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/members" className={styles.cardAction}>
              See members present and explore
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
