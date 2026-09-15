import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listCourses } from "@/lib/server/courses";
import Nav from "@/components/Nav";
import { cardThemeVars } from "@/lib/card-themes";
import styles from "./courses.module.css";

export const dynamic = "force-dynamic";

const COURSE_THEMES = ["indigo", "violet", "teal", "amber", "emerald", "sky", "rose", "fuchsia"];

export default async function CoursesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const courses = await listCourses(false);

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Beginner Crochet Series</h1>
          {userDoc?.role === "owner" && (
            <Link className={styles.adminLink} href="/admin/courses">Manage courses</Link>
          )}
        </div>
        <p className={styles.subtitle}>Start from the very first stitch and build your skills step by step with structured, self-paced lessons.</p>

        {courses.length === 0 ? (
          <p className={styles.empty}>No courses yet — check back soon.</p>
        ) : (
          <div className={styles.grid}>
            {courses.map((course, i) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className={styles.card}
                style={cardThemeVars(COURSE_THEMES[i % COURSE_THEMES.length], { light: true })}
              >
                <h2 className={styles.cardTitle}>
                  {course.title}
                  {course.requiredTier === "premium" && (
                    <span className={styles.premiumBadge}>Host</span>
                  )}
                </h2>
                {course.description && <p className={styles.cardDesc}>{course.description}</p>}
                <p className={styles.cardMeta}>Start learning →</p>
              </Link>
            ))}
          </div>
        )}
      </div>
</Nav>
  );
}
