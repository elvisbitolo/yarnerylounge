import styles from "./account.module.css";
import { Flame } from "lucide-react";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function today(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

export default function StreakCard({ gamification }) {
  const streak = Number(gamification?.streak) || 0;
  const bestStreak = Number(gamification?.bestStreak) || 0;
  const points = Number(gamification?.points) || 0;
  const recent = Array.isArray(gamification?.recentVisits) ? gamification.recentVisits : [];
  const lastVisitDate = gamification?.lastVisitDate || "";
  const todayKey = today(0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const key = today(i);
    const date = new Date(`${key}T00:00:00`);
    days.push({
      key,
      label: i === 0 ? "Today" : DAY_LABELS[date.getDay()],
      active: recent.includes(key) || (key === todayKey && key === lastVisitDate),
    });
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Your streaks</h2>
      <div className={styles.streakStats}>
        <div className={styles.streakStat}>
          <span className={styles.streakNumber}>{streak}</span>
          <span className={styles.streakLabel}>day streak <Flame size={13} /></span>
        </div>
        <div className={styles.streakStat}>
          <span className={styles.streakNumber}>{bestStreak}</span>
          <span className={styles.streakLabel}>best streak</span>
        </div>
        <div className={styles.streakStat}>
          <span className={styles.streakNumber}>{points}</span>
          <span className={styles.streakLabel}>points</span>
        </div>
      </div>
      <div className={styles.streakWeek}>
        {days.map((day) => (
          <div key={day.key} className={styles.streakDayWrap}>
            <span className={styles.streakDayLabel}>{day.label}</span>
            <span
              className={
                day.active ? `${styles.streakDay} ${styles.streakDayActive}` : styles.streakDay
              }
            >
              {day.active ? <Flame size={14} /> : null}
            </span>
          </div>
        ))}
      </div>
      <p className={styles.hint}>
        Visit the lounge every day to keep your streak going — you earn 10 points per day.
      </p>
    </section>
  );
}