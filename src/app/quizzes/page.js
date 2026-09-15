import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { Sparkles, MessageCircleQuestion } from "lucide-react";
import Nav from "@/components/Nav";
import styles from "./quizzes.module.css";

export const dynamic = "force-dynamic";

export default async function QuizzesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Quizzes</h1>
          <span className={styles.badge}>
            <Sparkles size={12} />
            Coming soon
          </span>
        </header>
        <p className={styles.subtitle}>
          Put your yarn knowledge to the test — stitch recognition, pattern puzzles, yarn-weight guessing and loads of
          fun.
        </p>

        <div className={styles.comingSoon}>
          <div className={styles.comingSoonTitle}>What&apos;s coming</div>
          <ul className={styles.featureList}>
            <li className={styles.featureItem}>Stitch &amp; symbol identification quizzes</li>
            <li className={styles.featureItem}>Yarn-weight and gauge guessers</li>
            <li className={styles.featureItem}>Pattern-reading riddle of the week</li>
            <li className={styles.featureItem}>Score tracking and friendly leaderboards</li>
          </ul>
        </div>

        <Link href="/quizzes/questions" className={styles.qaCard}>
          <span className={styles.qaIcon}>
            <MessageCircleQuestion size={20} />
          </span>
          <div>
            <div className={styles.qaTitle}>Need help right now?</div>
            <p className={styles.qaDesc}>Ask the community and get answers from fellow crocheters while the quizzes are being built.</p>
          </div>
          <span className={styles.qaCta}>Open community Q&amp;A →</span>
        </Link>
      </div>
    </Nav>
  );
}