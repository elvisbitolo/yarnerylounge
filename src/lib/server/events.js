import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { addInterval, expandEvent, expandEvents } from "@/lib/server/events-core";

export { expandEvent, expandEvents, addInterval };

function toDate(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return new Date(v.toMillis());
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  return new Date(v);
}

function mapEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    startTime: toDate(row.startTime),
    endTime: toDate(row.endTime),
    roomSlug: row.roomSlug || "",
    capacity: row.capacity || 0,
    spaceId: row.spaceId || "",
    purchasePriceCents: row.purchasePriceCents || 0,
    publicPreview: !!row.publicPreview,
    createdBy: row.createdBy,
    createdAt: toDate(row.createdAt),
    recurrence: row.recurrence && typeof row.recurrence === "object" ? row.recurrence : null,
    capacityCounts:
      row.capacityCounts && typeof row.capacityCounts === "object" ? row.capacityCounts : {},
    source: row.source || null,
  };
}

export async function listEvents() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.event.findMany({
        orderBy: { startTime: "asc" },
        take: 200,
      });
      return rows.map(mapEventRow);
    } catch (err) {
      logError("events.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function getEvent(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.event.findUnique({ where: { id } });
      return row ? mapEventRow(row) : null;
    } catch (err) {
      logError("events.prisma_get_failed", { error: err.message });
    }
  }
  return null;
}

export async function createEvent({ title, description, startTime, endTime, roomSlug, capacity, recurrence, spaceId, purchasePriceCents, publicPreview, createdBy, source }) {
  const data = {
    title,
    description: description || "",
    startTime: new Date(startTime),
    endTime: endTime ? new Date(endTime) : null,
    // Same FK trap as spaceId: "" is not "no room", it is a lookup for a room
    // whose slug is the empty string, which violates Event_roomSlug_fkey.
    roomSlug: roomSlug || null,
    capacity: Number(capacity) || 0,
    // A column typed as a plain String but declared as a relation is a foreign
    // key, so an empty string is not "no space": it violates Event_spaceId_fkey
    // and the insert fails. null is the correct value for an unset relation.
    spaceId: spaceId || null,
    purchasePriceCents: Math.max(Number(purchasePriceCents) || 0, 0),
    publicPreview: !!publicPreview,
    createdBy,
    // "availability" marks an event promoted from a member's block, so the
    // events page can tell it apart from an admin-scheduled one.
    source: source === "availability" ? "availability" : null,
    createdAt: new Date(),
  };
  if (recurrence && recurrence.freq && Number(recurrence.count) > 1) {
    data.recurrence = {
      freq: ["daily", "weekly", "monthly"].includes(recurrence.freq) ? recurrence.freq : "weekly",
      interval: Math.max(Number(recurrence.interval) || 1, 1),
      count: Math.min(Number(recurrence.count) || 2, 52),
    };
  }
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.event.create({ data });
      return { id: created.id, title, startTime };
    } catch (err) {
      logError("events.prisma_create_failed", { error: err.message });
    }
  }
  return { id: "", title, startTime };
}

export async function listRsvps(eventId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.rsvp.findMany({ where: { eventId } });
      return rows.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        occurrenceId: row.occurrenceId || "",
        userId: row.userId,
        name: row.name || "",
        createdAt: toDate(row.createdAt),
      }));
    } catch (err) {
      logError("events.prisma_rsvps_failed", { error: err.message });
    }
  }
  return [];
}

export async function getUpcomingRoomStart(slug, now = Date.now()) {
  if (!slug) return null;
  let events = [];
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.event.findMany({ where: { roomSlug: slug } });
      events = rows.map(mapEventRow);
    } catch (err) {
      logError("events.prisma_upcoming_failed", { error: err.message });
    }
  }
  let earliest = null;
  for (const event of events) {
    for (const occurrence of expandEvent(event)) {
      const start = new Date(occurrence.startTime).getTime();
      if (start > now && (earliest === null || start < earliest)) {
        earliest = start;
      }
    }
  }
  return earliest;
}
