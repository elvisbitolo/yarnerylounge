import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { expandEvents } from "@/lib/server/events";
import { nextOccurrenceAt } from "@/lib/server/availability-core";
import {
  PUBLIC_EVENT_SELECT,
  nextOccurrences,
  parsePublicLimit,
  toPublicEvent,
} from "@/lib/server/public-events-core";

// Public calendar feed for the Shopify landing page (secretyarnery.com).
// Includes scheduled Event records (including members-only events) and
// explicitly pinned, unpromoted Availability hangouts. Only pinned hangouts
// are eligible: pinning is the member's opt-in to share the block with others.
// Private room details, member names, avatars and notes are never returned.
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Access-Control-Allow-Origin": "*",
};

export async function GET(req) {
  const limit = parsePublicLimit(req.nextUrl.searchParams.get("limit"));
  const prisma = getPrisma();

  if (!prisma) {
    return NextResponse.json(
      { events: [], error: "database_not_configured" },
      { status: 503, headers: RESPONSE_HEADERS }
    );
  }

  try {
    const now = new Date();

    // Include every scheduled event type, including members-only events.
    // Expand recurring anchors before filtering by upcoming occurrence.
    const eventRows = await prisma.event.findMany({
      orderBy: [{ startTime: "desc" }, { createdAt: "desc" }],
      take: 500,
      select: PUBLIC_EVENT_SELECT,
    });

    const scheduledEvents = expandEvents(eventRows).filter(
      (event) =>
        Number.isFinite(new Date(event.startTime).getTime()) &&
        new Date(event.startTime).getTime() >= now.getTime()
    );

    // The signed-in Events page also shows standalone hangouts from
    // Availability. The old public endpoint never queried this model, so a
    // calendar made up of hangouts could appear empty on the Shopify page.
    // Only explicitly pinned blocks are shared publicly, and promoted blocks
    // are excluded because their linked Event is already in scheduledEvents.
    const availabilityRows = await prisma.availability.findMany({
      where: { pinned: true, eventId: null },
      orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
      take: 500,
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        recurring: true,
      },
    });

    const publicHangouts = availabilityRows
      .map((slot) => {
        const nextAt = nextOccurrenceAt(slot, now);
        if (!nextAt) return null;

        const startTime = new Date(nextAt);
        const originalStart = new Date(slot.startAt).getTime();
        const originalEnd = new Date(slot.endAt).getTime();
        const duration = Number.isFinite(originalEnd - originalStart)
          ? Math.max(originalEnd - originalStart, 0)
          : 0;

        return {
          id: `availability-${slot.id}`,
          title: slot.title || "Community hangout",
          description: "",
          startTime,
          endTime: duration ? new Date(startTime.getTime() + duration) : null,
          roomSlug: "",
          room: null,
        };
      })
      .filter(Boolean);

    const events = nextOccurrences([...scheduledEvents, ...publicHangouts])
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
      .slice(0, limit)
      .map(toPublicEvent);

    return NextResponse.json({ events }, { headers: RESPONSE_HEADERS });
  } catch (err) {
    logError("public_events.failed", { error: err.message });
    return NextResponse.json(
      { events: [], error: "event_query_failed" },
      { status: 500, headers: RESPONSE_HEADERS }
    );
  }
}
