import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getCourse, getLesson, getNextLessonId, getProgress, lessonBelongsToCourse } from "@/lib/server/courses";
import Nav from "@/components/Nav";
import BackButton from "@/components/BackButton";
import LessonView from "./LessonView";
import styles from "./lesson.module.css";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }) {
  const { id: courseId, lessonId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const course = await getCourse(courseId);
  const lesson = await getLesson(lessonId);
  if (!course || !lesson || !(await lessonBelongsToCourse(lesson, courseId))) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Lesson not found</h1>
          <Link className={styles.link} href="/courses">Back to courses</Link>
        </div>
      </main>
    );
  }
  if (course.status !== "published" && userDoc?.role !== "owner") {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Course not published</h1>
          <Link className={styles.link} href="/courses">Back to courses</Link>
        </div>
      </main>
    );
  }

  const isOwner = userDoc?.role === "owner";

  const releaseAt = lesson.releaseAt ? new Date(lesson.releaseAt.toMillis ? lesson.releaseAt.toMillis() : lesson.releaseAt) : null;
  // eslint-disable-next-line react-hooks/purity
  const locked = !isOwner && releaseAt && releaseAt.getTime() > Date.now();

  if (locked) {
    return (
        <Nav role={userDoc?.role}>
        <div className={styles.container}>
          <BackButton fallback={`/courses/${courseId}`} label="Back to course" />
          <div className={styles.locked}>
            <h1 className={styles.title}><Lock size={18} /> Locked</h1>
            <p className={styles.lockedText}>
              This lesson unlocks on{" "}
              {releaseAt.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
              . Check back then.
            </p>
            <Link className={styles.link} href={`/courses/${courseId}`}>Back to course</Link>
          </div>
        </div>
</Nav>
    );
  }

  const progress = await getProgress(courseId, user.uid);
  const completed = (progress.completedLessons || []).includes(lessonId);
  const nextLessonId = await getNextLessonId(courseId, lesson);

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <BackButton fallback={`/courses/${courseId}`} label="Back to course" />
        <p className={styles.breadcrumb}>
          <Link className={styles.link} href="/courses">Courses</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <Link className={styles.link} href={`/courses/${courseId}`}>{course.title}</Link>
        </p>
        <LessonView
          courseId={courseId}
          lesson={lesson}
          completed={completed}
          nextLessonId={nextLessonId}
          isOwner={isOwner}
        />
      </div>
</Nav>
  );
}
