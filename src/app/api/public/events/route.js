import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { expandEvents } from "@/lib/server/events";
import { Prisma } from "@/generated/prisma/client";
import {
  PUBLIC_EVENT_SELECT,
  nextOccurrences,
  parsePublicLimit,
  publicEventWhere,
  toPublicEvent,
} from "@/lib/server/public-events-core";

// Public event preview for the Shopify landing page (secretyarnery.com) and
// other marketing surfaces. No auth, no members-only meetups, and a lean
// shape so nothing internal leaks. The landing page fetches this from the
// visitor's browser, so CORS is wide open; the CDN holds the response for
// five minutes to match the page's refresh cadence.
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
    // Recurring meetups (promoted availability blocks) keep a first-occurrence
    // anchor that can already be in the past, so a bare startTime >= now query
    // would hide every repeating event after its first run. Read those anchors
    // from the last year and expand them afterwards.
    const cutoff = new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000);

    // Two reads instead of one. The single query read the oldest 300 anchors
    // in the window, so once a year held 300 past events the feed could not
    // show an upcoming one at all; upcoming anchors are read on their own
    // now. Past anchors are only read for recurring events, and the most
    // recent ones are the ones that can still have occurrences ahead.
    const [upcomingAnchors, pastRecurringAnchors] = await Promise.all([
      prisma.event.findMany({
        where: publicEventWhere({ startTime: { gte: now } }),
        orderBy: { startTime: "asc" },
        take: 100,
        select: PUBLIC_EVENT_SELECT,
      }),
      prisma.event.findMany({
        where: publicEventWhere({
          AND: [
            { startTime: { gte: cutoff, lt: now } },
            { recurrence: { not: Prisma.DbNull } },
          ],
        }),
        orderBy: { startTime: "desc" },
        take: 50,
        select: PUBLIC_EVENT_SELECT,
      }),
    ]);

    const occurrences = expandEvents([...upcomingAnchors, ...pastRecurringAnchors]).filter(
      (event) => new Date(event.startTime).getTime() >= now.getTime()
    );

    // One card per event, at its next occurrence: a weekly meetup used to
    // take every slot in the feed with copies of itself.
    const events = nextOccurrences(occurrences).slice(0, limit).map(toPublicEvent);

    return NextResponse.json({ events }, { headers: CACHE_HEADERS });
  } catch (err) {
    logError("public_events.failed", { error: err.message });
    return NextResponse.json({ events: [] }, { headers: CACHE_HEADERS, status: 500 });
  }
}
