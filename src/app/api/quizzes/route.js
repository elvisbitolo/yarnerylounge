import { NextResponse } from "next/server";
import { requireModerator, guardJson } from "@/lib/server/authorize";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getLesson } from "@/lib/server/courses";
import { canManageScope } from "@/lib/server/hosts";
import { createQuiz } from "@/lib/server/quizzes";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { httpStatusFor } from "@/lib/server/http-errors";
import { logAudit } from "@/lib/server/audit";

export async function POST(req) {
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`quiz:create:${auth.user.uid}`, { limit: 10 });
  if (limited) return limited;

  const { lessonId, moduleId, courseId, questions, passingScore } = await req.json();

  if (!lessonId || !moduleId || !courseId || typeof lessonId !== "string") {
    return NextResponse.json({ error: "Lesson, module, and course are required" }, { status: 400 });
  }

  const lesson = await getLesson(lessonId);
  if (!lesson || lesson.courseId !== courseId) {
    return NextResponse.json({ error: "Lesson not found in this course" }, { status: 404 });
  }

  const userDoc = await getUserDoc(auth.user.uid);
  const isStaff = userDoc?.role === "owner" || userDoc?.role === "moderator";
  if (!isStaff && !(await canManageScope(auth.user.uid, "course", courseId))) {
    return NextResponse.json({ error: "Course host access required" }, { status: 403 });
  }

  let result;
  try {
    result = await createQuiz({
      lessonId,
      moduleId,
      courseId,
      questions,
      passingScore,
      createdBy: auth.user.uid,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to create quiz" },
      { status: httpStatusFor(err) }
    );
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: userDoc?.name || auth.user.email || "",
    action: "quiz.created",
    metadata: { quizId: result.id, lessonId, courseId },
  });

  return NextResponse.json({ ok: true, id: result.id });
}
