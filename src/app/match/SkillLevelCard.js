import { Sparkles } from "lucide-react";
import styles from "./match.module.css";

export default function SkillLevelCard() {
  return (
    <section className={`${styles.matchCard} ${styles.matchCardLocked}`} aria-labelledby="skill-matches-title">
      <div className={styles.matchCardHeader}>
        <span className={styles.matchCardIcon}>
          <Sparkles size={20} />
        </span>
        <div>
          <p className={styles.matchKicker}>Targeted technique shares</p>
          <h2 id="skill-matches-title" className={styles.matchCardTitle}>Skill-Level Matches</h2>
        </div>
      </div>
      <div className={styles.matchCardBody}>
        <p className={styles.matchCardDesc}>
          Connect with crafters at your exact skill level for targeted technique shares.
        </p>
        <span className={styles.comingSoon}>Coming soon</span>
      </div>
    </section>
  );
}
