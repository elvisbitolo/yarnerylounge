import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const PROJECT_STATUSES = ["active", "completed", "archived"];

export function serializeProject(row) {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title || "",
    description: row.description || "",
    status: row.status || "active",
    craft: row.craft || "",
    projectType: row.projectType || "",
    yarnDetails: row.yarnDetails || "",
    hookSize: row.hookSize || "",
    imageUrls: Array.isArray(row.imageUrls) ? row.imageUrls : [],
    featured: !!row.featured,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

export async function listProjects(userId, { includeArchived = false } = {}) {
  const prisma = getPrisma();
  if (!prisma || !userId) return [];
  try {
    const rows = await prisma.project.findMany({
      where: { userId, ...(includeArchived ? {} : { status: { not: "archived" } }) },
      orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
    });
    return rows.map(serializeProject);
  } catch (err) {
    logError("projects.list_failed", { error: err.message, userId });
    return [];
  }
}
