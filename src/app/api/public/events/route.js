import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { expandEvents } from "@/lib/server/events";
import { Prisma } from "@/generated/prisma/client";
import {
  PUBLIC_EVENT_SELECT,
  nextOccurrences,
  parsePublicLimit,
  toPublicEvent,
} from "@/lib/server/public-events-core";

// Public calendar feed for the Shopify landing page (secretyarnery.com).
// The owner explicitly wants every upcoming calendar event advertised here,
// including events marked members-only or not opted into Explore preview.
// This endpoint therefore publishes event title, short description and times
// to anonymous visitors; it does not grant access to RSVP, join a room, or
// view member-only event content. Room slugs are still emitted only for
// publicly previewable, active rooms. The landing page fetches this in-browser,
// so CORS is open; the CDN caches the feed for five minutes.
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
  "Access-Control-Allow-Origin": "*",
};

export async function GET(req) {
  const limit = parsePublicLimit(req.nextUrl.searchParams.get("limit"));

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ events: [] }, { headers: CACHE_HEADERS });
  }

  try {
    const now = new Date();
    // Recurring events can have an anchor in the past, so include recent
    // recurring anchors and expand them to find their next future occurrence.
    const cutoff = new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000);

    // Deliberately do not apply publicEventWhere here: that helper is for
    // Explore/discovery and excludes members-only or non-preview events.
    // The marketing calendar has a separate, explicitly broader visibility
    // contract. Keep the query limited to future events and recent recurrences.
    const [upcomingAnchors, pastRecurringAnchors] = await Promise.all([
      prisma.event.findMany({
        where: { startTime: { gte: now } },
        orderBy: { startTime: "asc" },
        take: 100,
        select: PUBLIC_EVENT_SELECT,
      }),
      prisma.event.findMany({
        where: {
          AND: [
            { startTime: { gte: cutoff, lt: now } },
            { recurrence: { not: Prisma.DbNull } },
          ],
        },
        orderBy: { startTime: "desc" },
        take: 50,
        select: PUBLIC_EVENT_SELECT,
      }),
    ]);

    const occurrences = expandEvents([...upcomingAnchors, ...pastRecurringAnchors]).filter(
      (event) => new Date(event.startTime).getTime() >= now.getTime()
    );

    // One card per event, at its next occurrence: recurring events should not
    // occupy every slot with duplicate cards for the same base event.
    const events = nextOccurrences(occurrences).slice(0, limit).map(toPublicEvent);

    return NextResponse.json({ events }, { headers: CACHE_HEADERS });
  } catch (err) {
    logError("public_events.failed", { error: err.message });
    return NextResponse.json({ events: [] }, { headers: CACHE_HEADERS, status: 500 });
  }
}
