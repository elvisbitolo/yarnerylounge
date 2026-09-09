import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const AVAILABILITY_MAX_TITLE = 60;
export const AVAILABILITY_MAX_NOTE = 300;
export const AVAILABILITY_MAX_MINUTES = 24 * 60;
export const AVAILABILITY_MIN_MINUTES = 15;

export const CALENDAR_ROOMS = [
  { slug: "happy-hour-hub", name: "Happy Hour Hub", color: "#e91e63" },
  { slug: "lo-fi-and-loops", name: "Lo-Fi & Loops", color: "#2dd4bf" },
  { slug: "velvet-den", name: "The Velvet Den", color: "#a78bfa" },
  { slug: "silent-studio", name: "The Silent Studio", color: "#94a3b8" },
];

export function roomColorFor(slug) {
  return CALENDAR_ROOMS.find((r) => r.slug === slug)?.color || "#a78bfa";
}

export function roomNameFor(slug) {
  return CALENDAR_ROOMS.find((r) => r.slug === slug)?.name || slug || "Any room";
}

function toIso(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return new Date(v.toMillis()).toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return new Date(v).toISOString();
  if (typeof v === "string") return v;
  return null;
}

export function serializeAvailability(docOrRow) {
  const isDoc = typeof docOrRow?.data === "function";
  const data = isDoc ? docOrRow.data() : docOrRow;
  const id = isDoc ? docOrRow.id : docOrRow.id;
  return {
    id,
    userId: data.userId || "",
    userName: data.userName || "",
    userAvatar: data.userAvatar || "",
    title: data.title || "",
    note: data.note || "",
    roomSlug: data.roomSlug || "",
    roomName: roomNameFor(data.roomSlug),
    color: data.color || roomColorFor(data.roomSlug),
    startAt: toIso(data.startAt),
    endAt: toIso(data.endAt),
    recurring: data.recurring === "weekly" ? "weekly" : "none",
    rsvpCount: data.rsvpCount || 0,
    createdAt: toIso(data.createdAt),
  };
}

export async function listAvailability({ from, to }) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const where = {};
      if (from) where.startAt = { gte: new Date(from) };
      if (to) where.endAt = { lte: new Date(to) };
      const rows = await prisma.availability.findMany({
        where,
        orderBy: { startAt: "asc" },
        take: 500,
      });
      return rows.map(serializeAvailability);
    } catch (err) {
      logError("availability.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function getAvailability(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.availability.findUnique({ where: { id } });
      return row ? serializeAvailability(row) : null;
    } catch (err) {
      logError("availability.prisma_get_failed", { error: err.message });
    }
  }
  return null;
}

export async function listAvailabilityRsvps(availabilityId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.availabilityRsvp.findMany({
        where: { availabilityId },
        orderBy: { joinedAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        availabilityId: row.availabilityId,
        userId: row.userId,
        name: row.name || "",
        joinedAt: toIso(row.joinedAt) || "",
      }));
    } catch (err) {
      logError("availability.prisma_rsvps_failed", { error: err.message });
    }
  }
  return [];
}

async function updateRsvpCount(id, delta) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.availability.findUnique({ where: { id } });
      if (row) {
        await prisma.availability.update({
          where: { id },
          data: { rsvpCount: Math.max((row.rsvpCount || 0) + delta, 0) },
        });
        return true;
      }
    } catch (err) {
      logError("availability.prisma_count_failed", { error: err.message });
    }
  }
  return false;
}

export async function toggleAvailabilityRsvp(availabilityId, user) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const slot = await prisma.availability.findUnique({ where: { id: availabilityId } });
      if (!slot) return { error: "Slot not found", status: 404 };
      const key = `${availabilityId}_${user.uid}`;
      const existing = await prisma.availabilityRsvp.findUnique({ where: { id: key } });
      if (existing) {
        await prisma.availabilityRsvp.delete({ where: { id: key } });
        await updateRsvpCount(availabilityId, -1);
        return { joined: false, hostId: slot.userId, title: slot.title };
      }
      await prisma.availabilityRsvp.create({
        data: {
          id: key,
          availabilityId,
          userId: user.uid,
          name: user.name || "Member",
          joinedAt: new Date(),
        },
      });
      await updateRsvpCount(availabilityId, +1);
      return { joined: true, hostId: slot.userId, title: slot.title };
    } catch (err) {
      logError("availability.prisma_toggle_rsvp_failed", { error: err.message });
    }
  }
  return { error: "Database unavailable", status: 500 };
}

export async function createAvailability({ userId, userName, userAvatar, title, note, roomSlug, startAt, endAt, recurring }) {
  const data = {
    userId,
    userName: userName || "Member",
    userAvatar: userAvatar || "",
    title,
    note: note || "",
    roomSlug: roomSlug || "",
    color: roomColorFor(roomSlug),
    startAt: new Date(startAt),
    endAt: new Date(endAt),
    recurring: recurring === "weekly" ? "weekly" : "none",
    rsvpCount: 0,
    createdAt: new Date(),
  };
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.availability.create({ data });
      return { id: created.id };
    } catch (err) {
      logError("availability.prisma_create_failed", { error: err.message });
    }
  }
  return { id: "" };
}

export async function deleteAvailability(id, uid) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const slot = await prisma.availability.findUnique({ where: { id } });
      if (!slot) return { error: "Slot not found", status: 404 };
      if (slot.userId !== uid) return { error: "You can only delete your own slots", status: 403 };
      await prisma.$transaction([
        prisma.availabilityRsvp.deleteMany({ where: { availabilityId: id } }),
        prisma.availability.delete({ where: { id } }),
      ]);
      return { ok: true };
    } catch (err) {
      logError("availability.prisma_delete_failed", { error: err.message });
    }
  }
  return { error: "Database unavailable", status: 500 };
}
