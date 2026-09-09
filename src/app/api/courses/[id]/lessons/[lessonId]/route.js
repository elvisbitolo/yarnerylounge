import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { canManageScope } from "@/lib/server/hosts";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function DELETE(req, { params }) {
  const { id, lessonId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!(await canManageScope(user.uid, "course", id))) {
    return NextResponse.json({ error: "Course host access required" }, { status: 403 });
  }

  const prisma = getPrisma();
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, courseId: true },
    });
    if (!lesson || lesson.courseId !== id) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }
    await prisma.lesson.delete({ where: { id: lessonId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("lessons.delete_prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Could not delete lesson" }, { status: 500 });
  }
}