import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { listEvents, expandEvents } from "@/lib/server/events";

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

export async function getExploreData(limit = 6) {
  const prisma = getPrisma();
  const safeLimit = Math.max(Number(limit) || 6, 1);

  if (!prisma) {
    return { rooms: [], events: [], courses: [], spaces: [] };
  }

  try {
    const [roomRows, eventRows, courseRows, spaceRows] = await Promise.all([
      prisma.room.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.event.findMany({ orderBy: { startTime: "asc" } }),
      prisma.course.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.space.findMany({ orderBy: { createdAt: "desc" } }),
    ]);

    const rooms = roomRows
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description || "",
        kind: row.kind || "standard",
        publicPreview: !!row.publicPreview,
        status: row.status || "active",
      }))
      .filter((room) => room.publicPreview && room.status === "active")
      .slice(0, safeLimit)
      .map(({ publicPreview, status, ...rest }) => rest);

    const courses = courseRows
      .map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description || "",
        purchasePriceCents: Number(row.purchasePriceCents) || 0,
        publicPreview: !!row.publicPreview,
        status: row.status || "draft",
      }))
      .filter((course) => course.publicPreview && course.status === "published")
      .slice(0, safeLimit)
      .map(({ publicPreview, status, ...rest }) => rest);

    const spaces = spaceRows
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description || "",
        publicPreview: !!row.publicPreview,
        status: row.status || "active",
        access: row.access || "public",
      }))
      .filter((space) => space.publicPreview && space.status === "active" && space.access !== "invite")
      .slice(0, safeLimit)
      .map(({ publicPreview, status, ...rest }) => rest);

    const now = Date.now();
    const events = expandEvents(
      eventRows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description || "",
        startTime: toMillis(row.startTime),
        publicPreview: !!row.publicPreview,
      }))
    )
      .filter((event) => event.publicPreview && toMillis(event.startTime) > now)
      .sort((a, b) => toMillis(a.startTime) - toMillis(b.startTime))
      .slice(0, safeLimit)
      .map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description || "",
        startTime: toMillis(event.startTime),
      }));

    return { rooms, events, courses, spaces };
  } catch (err) {
    logError("explore.prisma_failed", { error: err.message });
    return { rooms: [], events: [], courses: [], spaces: [] };
  }
}
