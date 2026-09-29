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
  normalizeTimeZone,
  recurringWeekday,
  recurringLabel,
  recurringShortLabel,
  weeklyFirstOccurrence,
  serializeAvailability,
  nextOccurrenceAt,
  recurringDayMatches,
  availabilityWindowWhere,
  toIso,
} from "@/lib/server/availability-core";

// Re-exported for the API routes. linkAvailabilityEvent is declared with
// `export async function` below, so it must not be listed here as well.
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
  normalizeTimeZone,
  recurringWeekday,
  recurringLabel,
  recurringShortLabel,
  weeklyFirstOccurrence,
  serializeAvailability,
  nextOccurrenceAt,
  recurringDayMatches,
  availabilityWindowWhere,
};

export async function listAvailability({ from, to } = {}) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const where = availabilityWindowWhere({ from, to });
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

export async function createAvailability({ userId, userName, userAvatar, title, note, roomSlug, startAt, endAt, recurring, timeZone, eventId }) {
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
    // Pins the wall clock a recurring block means, so "every Tuesday 11:00"
    // stays 11:00 in the creator's own zone across DST.
    timeZone: normalizeTimeZone(timeZone),
    recurring: normalizeRecurring(recurring),
    rsvpCount: 0,
    createdAt: new Date(),
  };
  // Points at the Event this block was promoted to, so the events page can hide
  // the duplicate and the delete path can cascade.
  if (eventId) data.eventId = eventId;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.availability.create({ data });
      return { id: created.id, eventId: created.eventId || null };
    } catch (err) {
      logError("availability.prisma_create_failed", { error: err.message });
    }
  }
  return { id: "" };
}

// Points an existing block at the meetup created from it. Separate from
// createAvailability so the block exists before its event does.
export async function linkAvailabilityEvent(availabilityId, eventId) {
  if (!availabilityId || !eventId) return { ok: false };
  const prisma = getPrisma();
  if (!prisma) return { ok: false };
  try {
    await prisma.availability.update({
      where: { id: availabilityId },
      data: { eventId },
    });
    return { ok: true };
  } catch (err) {
    // A unique-violation means this block is already linked to another event, so
    // the caller can surface that rather than silently creating a second one.
    logError("availability.prisma_link_event_failed", { error: err.message });
    return { ok: false, error: err.message };
  }
}

export async function deleteAvailability(id, uid) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const slot = await prisma.availability.findUnique({ where: { id } });
      if (!slot) return { error: "Slot not found", status: 404 };
      if (slot.userId !== uid) return { error: "You can only delete your own slots", status: 403 };
      // The meetup was derived from this block, so it goes with it. A foreign
      // key cannot express "deleting the parent removes the child" here: ON
      // DELETE CASCADE would run in the wrong direction (see migration 13), so
      // the event and its RSVPs are removed explicitly, in the same transaction.
      const steps = [
        prisma.availabilityRsvp.deleteMany({ where: { availabilityId: id } }),
        prisma.availability.delete({ where: { id } }),
      ];
      if (slot.eventId) {
        steps.push(prisma.rsvp.deleteMany({ where: { eventId: slot.eventId } }));
        steps.push(prisma.event.delete({ where: { id: slot.eventId } }));
      }
      await prisma.$transaction(steps);
      return { ok: true, eventId: slot.eventId || null };
    } catch (err) {
      logError("availability.prisma_delete_failed", { error: err.message });
    }
  }
  return { error: "Database unavailable", status: 500 };
}
