import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getCourse, getModules, getLessons } from "@/lib/server/courses";
import { getQuizByLesson, getQuizResult } from "@/lib/server/quizzes";
import BackButton from "@/components/BackButton";
import QuizBlock from "../QuizBlock";
import styles from "../../courses.module.css";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params, searchParams }) {
  const { id } = await params;
  const { lessonId } = await searchParams || {};
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const course = await getCourse(id);
  if (!course) {
    redirect("/courses");
  }

  const quiz = lessonId ? await getQuizByLesson(lessonId) : await findFirstQuiz(id);

  if (!quiz) {
    return (
        <div className={styles.container}>
          <BackButton fallback={`/courses/${id}`} label="Back to course" />
          <h1 className={styles.title}>No quiz found</h1>
          <p className={styles.subtitle}>This course doesn&apos;t have a quiz for that lesson.</p>
        </div>
    );
  }

  const previousResult = await getQuizResult(quiz.id, user.uid);

  return (
      <div className={styles.container}>
        <BackButton fallback={`/courses/${id}`} label="Back to course" />
        <p className={styles.breadcrumb}>Course quiz</p>
        <QuizBlock
          quizId={quiz.id}
          questions={quiz.questions || []}
          passingScore={Number(quiz.passingScore) || 70}
          previousResult={previousResult || null}
        />
      </div>
  );
}

async function findFirstQuiz(courseId) {
  const modules = await getModules(courseId);
  for (const mod of modules) {
    const lessons = await getLessons(mod.id);
    for (const lesson of lessons) {
      const quiz = await getQuizByLesson(lesson.id);
      if (quiz) return quiz;
    }
  }
  return null;
}
