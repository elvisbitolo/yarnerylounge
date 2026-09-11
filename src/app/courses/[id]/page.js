import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getCourseFull, getProgress } from "@/lib/server/courses";
import { getQuizByLesson, getQuizResult } from "@/lib/server/quizzes";
import Nav from "@/components/Nav";
import BackButton from "@/components/BackButton";
import QuizBlock from "./QuizBlock";
import styles from "../courses.module.css";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CoursePage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const { course, modules, lessons } = (await getCourseFull(id)) || {};
  if (!course || (course.status !== "published" && userDoc?.role !== "owner")) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Course not found</h1>
          <p className={styles.subtitle}>This course isn&apos;t available.</p>
          <Link className={styles.link} href="/courses">Back to courses</Link>
        </div>
      </main>
    );
  }

  const isOwner = userDoc?.role === "owner";

  const quizzesByLesson = {};
  const resultsByLesson = {};
  for (const mod of modules) {
    for (const lesson of lessons[mod.id] || []) {
      const quiz = await getQuizByLesson(lesson.id);
      if (quiz) {
        quizzesByLesson[lesson.id] = {
          id: quiz.id,
          lessonId: quiz.lessonId,
          moduleId: quiz.moduleId,
          courseId: quiz.courseId,
          questions: quiz.questions || [],
          passingScore: Number(quiz.passingScore) || 70,
        };
        resultsByLesson[lesson.id] = await getQuizResult(quiz.id, user.uid);
      }
    }
  }

  const progress = await getProgress(id, user.uid);
  const completed = new Set(progress.completedLessons || []);
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const totalLessons = modules.reduce((sum, m) => sum + lessons[m.id].length, 0);
  const doneCount = modules.reduce(
    (sum, m) => sum + lessons[m.id].filter((l) => completed.has(l.id)).length,
    0
  );
  const pct = totalLessons ? Math.round((doneCount / totalLessons) * 100) : 0;

  function isLocked(lesson) {
    if (isOwner || !lesson.releaseAt) return false;
    const ts = lesson.releaseAt?.toMillis?.() || Number(lesson.releaseAt) || 0;
    return ts > now;
  }

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <BackButton fallback="/courses" label="All courses" />
        <p className={styles.breadcrumb}>
          <Link className={styles.link} href="/courses">Courses</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span>{course.title}</span>
        </p>

        <div className={styles.courseHeader}>
          <div className={styles.courseTitleRow}>
            <h1 className={styles.title}>{course.title}</h1>
            {course.status !== "published" && <span className={styles.draftBadge}>Draft</span>}
          </div>
          {course.description && <p className={styles.subtitle}>{course.description}</p>}
          {userDoc?.role === "owner" && (
            <Link className={styles.adminLink} href={`/admin/courses/${id}`}>Manage course</Link>
          )}
        </div>

        {totalLessons > 0 && (
          <div className={styles.progressCard}>
            <div className={styles.progressRow}>
              <span className={styles.progressLabel}>
                {doneCount} of {totalLessons} lessons complete
              </span>
              <span className={styles.progressPct}>{pct}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {modules.length === 0 ? (
          <p className={styles.empty}>
            This course doesn&apos;t have any lessons yet.
            {userDoc?.role === "owner" && (
              <> <Link className={styles.link} href={`/admin/courses/${id}`}>Add content</Link>.</>
            )}
          </p>
        ) : (
          <div className={styles.moduleList}>
            {modules.map((module, index) => {
              const moduleLessons = lessons[module.id] || [];
              return (
                <section key={module.id} className={styles.module}>
                  <h2 className={styles.moduleTitle}>
                    <span className={styles.moduleIndex}>{index + 1}</span>
                    {module.title}
                  </h2>
                  <div className={styles.lessonList}>
                    {moduleLessons.map((lesson) => {
                      const isDone = completed.has(lesson.id);
                      const locked = isLocked(lesson);
                      const href = locked ? `#` : `/courses/${id}/lessons/${lesson.id}`;
                      return (
                        <div key={lesson.id}>
                          <Link
                            href={href}
                            aria-disabled={locked}
                            className={locked ? `${styles.lesson} ${styles.lessonLocked}` : styles.lesson}
                          >
                            <span className={isDone ? `${styles.lessonMark} ${styles.lessonDone}` : styles.lessonMark}>
                              {locked ? <Lock size={14} /> : isDone ? "✓" : "•"}
                            </span>
                            <span className={styles.lessonTitle}>{lesson.title}</span>
                            {lesson.kind === "video" && (
                              <span className={styles.lessonKind}>▶ video</span>
                            )}
                          </Link>
                          {quizzesByLesson[lesson.id] && (
                            <QuizBlock
                              quizId={quizzesByLesson[lesson.id].id}
                              questions={quizzesByLesson[lesson.id].questions}
                              passingScore={quizzesByLesson[lesson.id].passingScore}
                              previousResult={resultsByLesson[lesson.id] || null}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
</Nav>
  );
}
