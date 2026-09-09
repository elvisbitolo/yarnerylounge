import { NextResponse } from "next/server";
import { getCourse, getProgress, lessonBelongsToCourse } from "@/lib/server/courses";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { getUserDoc } from "@/lib/server/auth";
import { awardPoints, awardBadge, POINTS } from "@/lib/server/gamification";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

export async function POST(req, { params }) {
  const { id: courseId } = await params;
  const course = await getCourse(courseId);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`progress:${auth.user.uid}`, { limit: 60 });
  if (limited) return limited;

  const { lessonId, completed } = await req.json();
  if (!lessonId || typeof lessonId !== "string") {
    return NextResponse.json({ error: "Lesson required" }, { status: 400 });
  }

  const prisma = getPrisma();
  let lessonBelongs = false;
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { courseId: true },
    });
    if (lesson) {
      lessonBelongs = await lessonBelongsToCourse(lesson, courseId);
    }
  } catch (err) {
    logError("progress.lesson_read_failed", { error: err.message, lessonId });
  }
  if (!lessonBelongs) {
    return NextResponse.json({ error: "Lesson not found in this course" }, { status: 404 });
  }

  const progress = await getProgress(courseId, auth.user.uid);
  const completedLessons = new Set(progress.completedLessons || []);
  const newlyCompleted = completed && !completedLessons.has(lessonId);
  if (completed) {
    completedLessons.add(lessonId);
  } else {
    completedLessons.delete(lessonId);
  }
  try {
    await prisma.progress.upsert({
      where: { courseId_userId: { courseId, userId: auth.user.uid } },
      create: {
        id: `${courseId}_${auth.user.uid}`,
        courseId,
        userId: auth.user.uid,
        completedLessons: [...completedLessons],
      },
      update: {
        completedLessons: [...completedLessons],
      },
    });

    if (newlyCompleted) {
      const userDoc = await getUserDoc(auth.user.uid);
      const name = userDoc?.name || auth.user.name || "Member";
      await awardPoints(auth.user.uid, POINTS.LESSON, name).catch((err) => {
        logError("gamification.lesson_failed", { uid: auth.user.uid, courseId, lessonId, error: err.message });
      });
      const lessonsCount = await prisma.lesson.count({ where: { courseId } });
      if (lessonsCount > 0 && completedLessons.size >= lessonsCount) {
        await awardBadge(auth.user.uid, "course_complete", name).catch((err) => {
          logError("gamification.badge_failed", { uid: auth.user.uid, courseId, error: err.message });
        });
      }
    }

    return NextResponse.json({ completedLessons: [...completedLessons] });
  } catch (err) {
    logError("progress.update_prisma_failed", { error: err.message, uid: auth.user.uid, courseId });
    return NextResponse.json({ error: "Could not update progress" }, { status: 500 });
  }
}
