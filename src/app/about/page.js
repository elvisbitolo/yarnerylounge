import Link from "next/link";
import LandingNav from "@/components/LandingNav";
import styles from "./about.module.css";

export const metadata = {
  title: "About",
  description:
    "Learn about Secret Yarnery — a paid membership community for live video lounges, courses, events and real conversations.",
};

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <LandingNav />
      <div className={styles.container}>
        <h1 className={styles.title}>About Secret Yarnery</h1>
        <p className={styles.lead}>
          Secret Yarnery is a paid membership community where people connect live, learn together and
          build real relationships — not just feeds of posts.
        </p>

        <section className={styles.section}>
          <h2 className={styles.heading}>What you get</h2>
          <ul className={styles.list}>
            <li>
              <strong>Live lounges</strong> — real-time video lounges for conversations, coworking and
              broadcasts with your community.
            </li>
            <li>
              <strong>Courses</strong> — structured lessons, progress tracking and certificates of
              completion.
            </li>
            <li>
              <strong>Events</strong> — recurring meetups and one-off gatherings with RSVPs, calendar
              invites and reminders.
            </li>
            <li>
              <strong>Groups &amp; spaces</strong> — interest-based spaces to organize discussions,
              share and go deeper on topics that matter to you.
            </li>
            <li>
              <strong>Conversation</strong> — direct messages, group chats, polls, hashtags and a
              leaderboard that celebrates engaged members.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>Why membership?</h2>
          <p>
            Membership keeps the community focused and safe. By charging a fair price, Secret Yarnery
            stays free of ads and sponsored noise, and we can invest in moderators, high-quality
            content and reliable live infrastructure.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>Our commitments</h2>
          <ul className={styles.list}>
            <li>Your personal data stays private — never sold, never shared.</li>
            <li>Clear, respectful community guidelines, enforced consistently.</li>
            <li>You can cancel your membership anytime from your account.</li>
          </ul>
        </section>

        <section className={styles.cta}>
          <p>Ready to join?</p>
          <Link className={styles.ctaLink} href="/signup">
            Join the clubhouse
          </Link>
        </section>
      </div>
    </main>
  );
}
