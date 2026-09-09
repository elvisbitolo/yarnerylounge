import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { meetsTier } from "@/lib/server/plans";

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

export function canAccessCourse(course, tier) {
  return meetsTier(tier, course?.requiredTier);
}

function mapCourseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    status: row.status || "draft",
    spaceId: row.spaceId || "",
    purchasePriceCents: row.purchasePriceCents || 0,
    publicPreview: !!row.publicPreview,
    requiredTier: row.requiredTier || "",
    createdBy: row.createdBy,
    createdAt: toMillisValue(row.createdAt) || null,
    updatedAt: toMillisValue(row.updatedAt) || null,
  };
}

function mapModuleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    position: row.position || 0,
    createdAt: toMillisValue(row.createdAt) || null,
  };
}

function mapLessonRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    courseId: row.courseId,
    moduleId: row.moduleId,
    title: row.title,
    body: row.body || "",
    kind: row.kind || "text",
    position: row.position || 0,
    videoUrl: row.videoUrl || "",
    releaseAt: toMillisValue(row.releaseAt) || null,
    createdAt: toMillisValue(row.createdAt) || null,
  };
}

export async function listCourses(includeDrafts = false) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.course.findMany({ orderBy: { createdAt: "desc" } });
      const docs = rows.map(mapCourseRow);
      return includeDrafts ? docs : docs.filter((course) => course.status === "published");
    } catch (err) {
      logError("courses.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function getCourse(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.course.findUnique({ where: { id } });
      return row ? mapCourseRow(row) : null;
    } catch (err) {
      logError("courses.prisma_get_failed", { error: err.message });
    }
  }
  return null;
}

export async function getModules(courseId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.module.findMany({ where: { courseId } });
      return rows.map(mapModuleRow).sort((a, b) => a.position - b.position);
    } catch (err) {
      logError("courses.prisma_modules_failed", { error: err.message });
    }
  }
  return [];
}

export async function getLessons(moduleId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.lesson.findMany({
        where: { moduleId },
        orderBy: { position: "asc" },
      });
      return rows.map(mapLessonRow);
    } catch (err) {
      logError("courses.prisma_lessons_failed", { error: err.message });
    }
  }
  return [];
}

export async function getCourseFull(id) {
  const course = await getCourse(id);
  if (!course) return null;
  const modules = await getModules(id);
  const lessons = {};
  for (const mod of modules) {
    lessons[mod.id] = await getLessons(mod.id);
  }
  return { course, modules, lessons };
}

export async function getLesson(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.lesson.findUnique({ where: { id } });
      return row ? mapLessonRow(row) : null;
    } catch (err) {
      logError("courses.prisma_lesson_failed", { error: err.message });
    }
  }
  return null;
}

export async function lessonBelongsToCourse(lesson, courseId) {
  if (lesson?.courseId === courseId) return true;
  if (!lesson?.courseId && lesson?.moduleId) {
    const prisma = getPrisma();
    if (prisma) {
      try {
        const mod = await prisma.module.findUnique({ where: { id: lesson.moduleId } });
        if (mod) return mod.courseId === courseId;
      } catch (err) {
        logError("courses.prisma_lesson_belongs_failed", { error: err.message });
      }
    }
  }
  return false;
}

export async function getProgress(courseId, uid) {
  const id = `${courseId}_${uid}`;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.progress.findUnique({ where: { id } });
      if (row) return { completedLessons: row.completedLessons || [] };
    } catch (err) {
      logError("courses.prisma_progress_failed", { error: err.message });
    }
  }
  return { completedLessons: [] };
}

export async function getNextLessonId(courseId, lesson) {
  const modules = await getModules(courseId);
  const all = [];
  for (const mod of modules) {
    const list = await getLessons(mod.id);
    all.push(...list);
  }
  const index = all.findIndex((l) => l.id === lesson.id);
  return index >= 0 && index < all.length - 1 ? all[index + 1].id : null;
}
