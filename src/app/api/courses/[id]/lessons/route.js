import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getCourse, getModules } from "@/lib/server/courses";
import { canManageScope } from "@/lib/server/hosts";
import { clean } from "@/lib/server/validate";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function POST(req, { params }) {
  const { id: courseId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const course = await getCourse(courseId);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!(await canManageScope(user.uid, "course", courseId))) {
    return NextResponse.json({ error: "Course host access required" }, { status: 403 });
  }

  const { moduleId, title, body = "", kind = "text", videoUrl = "", releaseAt = "" } = await req.json();
  const lessonTitle = clean(title, 120);
  if (!moduleId || !lessonTitle) {
    return NextResponse.json({ error: "Lesson title and module required" }, { status: 400 });
  }

  const prisma = getPrisma();
  let position = 1;
  try {
    const mod = await prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true, courseId: true },
    });
    if (!mod || mod.courseId !== courseId) {
      return NextResponse.json({ error: "Module not found in this course" }, { status: 404 });
    }
    const existing = await getModules(courseId);
    for (const m of existing) {
      if (m.id === moduleId) {
        const lessons = await prisma.lesson.findMany({
          where: { moduleId },
          select: { position: true },
        });
        position = lessons.length ? Math.max(...lessons.map((l) => l.position || 0)) + 1 : 1;
        break;
      }
    }

    const lessonKind = kind === "video" ? "video" : "text";
    const data = {
      courseId,
      moduleId,
      title: lessonTitle,
      body: clean(body, 100000) || "",
      kind: lessonKind,
      position,
      createdAt: new Date(),
    };
    if (lessonKind === "video") {
      data.videoUrl = videoUrl || "";
    }
    if (releaseAt) {
      const parsed = Date.parse(releaseAt);
      if (Number.isFinite(parsed)) data.releaseAt = new Date(parsed);
    }

    const created = await prisma.lesson.create({ data });
    return NextResponse.json({ id: created.id });
  } catch (err) {
    logError("lessons.create_prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Could not create lesson" }, { status: 500 });
  }
}
