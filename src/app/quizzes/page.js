import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listCommunityQuestions } from "@/lib/server/community-questions";
import Nav from "@/components/Nav";
import AskQuestionForm from "./AskQuestionForm";
import styles from "./quizzes.module.css";

export const dynamic = "force-dynamic";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default async function CommunityQAPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const questions = await listCommunityQuestions();

  const openCount = questions.filter((q) => q.status === "open").length;

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Community Q&A</h1>
            <p className={styles.subtitle}>
              Stuck on a pattern, hook, or stitch? Ask the community and get real answers from fellow crocheters.
            </p>
          </div>
        </header>

        <AskQuestionForm />

        <div className={styles.headingRow}>
          <h2 className={styles.sectionTitle}>Questions</h2>
          <span className={styles.count}>{openCount} open · {questions.length} total</span>
        </div>

        <div className={styles.list}>
          {questions.length === 0 ? (
            <p className={styles.empty}>
              No questions yet — be the first to ask something.
            </p>
          ) : (
            questions.map((q) => (
              <Link key={q.id} href={`/quizzes/${q.id}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <h3 className={styles.cardTitle}>{q.title}</h3>
                  <span className={q.status === "resolved" ? `${styles.badge} ${styles.badgeResolved}` : styles.badge}>
                    {q.status === "resolved" ? "Resolved" : "Open"}
                  </span>
                </div>
                <p className={styles.cardBody}>{q.body}</p>
                <p className={styles.cardMeta}>
                  {q.answerCount} {q.answerCount === 1 ? "answer" : "answers"} · {q.authorName} · {formatDate(q.createdAt)}
                </p>
              </Link>
            ))
          )}
        </div>
      </div>
    </Nav>
  );
}