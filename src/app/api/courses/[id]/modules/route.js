import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getCourse, getModules } from "@/lib/server/courses";
import { canManageScope } from "@/lib/server/hosts";
import { clean } from "@/lib/server/validate";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET(req, { params }) {
  const { id: courseId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!(await canManageScope(user.uid, "course", courseId))) {
    return NextResponse.json({ error: "Course host access required" }, { status: 403 });
  }
  const modules = await getModules(courseId);
  const lessons = {};
  const prisma = getPrisma();
  try {
    const rows = await prisma.lesson.findMany({
      where: { moduleId: { in: modules.map((m) => m.id) } },
      orderBy: { position: "asc" },
    });
    for (const lesson of rows) {
      if (!lessons[lesson.moduleId]) lessons[lesson.moduleId] = [];
      lessons[lesson.moduleId].push(lesson);
    }
  } catch (err) {
    logError("modules.lessons_read_failed", { error: err.message });
  }
  return NextResponse.json({ modules, lessons });
}

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

  const { title } = await req.json();
  const moduleTitle = clean(title, 120);
  if (!moduleTitle) {
    return NextResponse.json({ error: "Module title required" }, { status: 400 });
  }

  const prisma = getPrisma();
  try {
    const existing = await getModules(courseId);
    const position = existing.length ? Math.max(...existing.map((m) => m.position)) + 1 : 1;
    const created = await prisma.module.create({
      data: {
        courseId,
        title: moduleTitle,
        position,
        createdAt: new Date(),
      },
    });
    return NextResponse.json({ id: created.id });
  } catch (err) {
    logError("modules.create_prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Could not create module" }, { status: 500 });
  }
}
