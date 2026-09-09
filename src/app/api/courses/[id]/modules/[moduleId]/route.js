import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { canManageScope } from "@/lib/server/hosts";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function DELETE(req, { params }) {
  const { id, moduleId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!(await canManageScope(user.uid, "course", id))) {
    return NextResponse.json({ error: "Course host access required" }, { status: 403 });
  }

  const prisma = getPrisma();
  try {
    const mod = await prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true, courseId: true },
    });
    if (!mod || mod.courseId !== id) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }
    await prisma.lesson.deleteMany({ where: { moduleId } });
    await prisma.module.delete({ where: { id: moduleId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("modules.delete_prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Could not delete module" }, { status: 500 });
  }
}