import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  AVAILABILITY_MAX_TITLE,
  AVAILABILITY_MAX_NOTE,
  AVAILABILITY_MAX_MINUTES,
  AVAILABILITY_MIN_MINUTES,
  CALENDAR_ROOMS,
  WEEKDAY_NAMES,
  RECURRING_OPTIONS,
  roomColorFor,
  roomNameFor,
  normalizeRecurring,
  recurringWeekday,
  recurringLabel,
  recurringShortLabel,
  weeklyFirstOccurrence,
  serializeAvailability,
  nextOccurrenceAt,
  recurringDayMatches,
  toIso,
} from "@/lib/server/availability-core";

export {
  AVAILABILITY_MAX_TITLE,
  AVAILABILITY_MAX_NOTE,
  AVAILABILITY_MAX_MINUTES,
  AVAILABILITY_MIN_MINUTES,
  CALENDAR_ROOMS,
  WEEKDAY_NAMES,
  RECURRING_OPTIONS,
  roomColorFor,
  roomNameFor,
  normalizeRecurring,
  recurringWeekday,
  recurringLabel,
  recurringShortLabel,
  weeklyFirstOccurrence,
  serializeAvailability,
  nextOccurrenceAt,
  recurringDayMatches,
};

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
    recurring: normalizeRecurring(recurring),
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
