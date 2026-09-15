import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getCommunityQuestion } from "@/lib/server/community-questions";
import Nav from "@/components/Nav";
import AnswerForm from "./AnswerForm";
import AnswerControls from "./AnswerControls";
import styles from "../quizzes.module.css";

export const dynamic = "force-dynamic";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default async function QuestionDetailPage({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const question = await getCommunityQuestion(id);
  if (!question) notFound();

  const userDoc = await getUserDoc(user.uid);
  const isAuthor = question.authorId === user.uid;

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <Link href="/quizzes/questions" className={styles.backLink}>← Back to all questions</Link>

        <article className={styles.detailCard}>
          <div className={styles.cardTop}>
            <h1 className={styles.questionTitle}>{question.title}</h1>
            <span className={question.status === "resolved" ? `${styles.badge} ${styles.badgeResolved}` : styles.badge}>
              {question.status === "resolved" ? "Resolved" : "Open"}
            </span>
          </div>
          <p className={styles.questionMeta}>
            Asked by {question.authorName} · {formatDate(question.createdAt)}
          </p>
          <p className={styles.questionBody}>{question.body}</p>
        </article>

        <div className={styles.headingRow}>
          <h2 className={styles.sectionTitle}>Answers</h2>
          <span className={styles.count}>{question.answerCount} {question.answerCount === 1 ? "answer" : "answers"}</span>
        </div>

        <div className={styles.list}>
          {question.answers.length === 0 ? (
            <p className={styles.empty}>No answers yet — share what you know to help them out.</p>
          ) : (
            question.answers.map((answer) => (
              <div
                key={answer.id}
                className={answer.accepted ? `${styles.answerCard} ${styles.answerAccepted}` : styles.answerCard}
              >
                <div className={styles.answerTop}>
                  <span className={styles.answerAuthor}>{answer.authorName}</span>
                  <span className={styles.answerDate}>{formatDate(answer.createdAt)}</span>
                  {answer.accepted && <span className={`${styles.badge} ${styles.badgeResolved}`}>Accepted</span>}
                </div>
                <p className={styles.answerBody}>{answer.body}</p>
                {isAuthor && !answer.accepted && question.status !== "resolved" && (
                  <AnswerControls questionId={question.id} answerId={answer.id} />
                )}
              </div>
            ))
          )}
        </div>

        <AnswerForm questionId={id} />
      </div>
    </Nav>
  );
}