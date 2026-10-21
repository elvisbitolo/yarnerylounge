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
// Event titles, descriptions and times are intentionally public, including
// events marked members-only. Do not include private room details.
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Access-Control-Allow-Origin": "*",
};

export async function GET(req) {
  const limit = parsePublicLimit(req.nextUrl.searchParams.get("limit"));
  const prisma = getPrisma();

  // Do not disguise a missing production database configuration as an empty
  // calendar. This lets us distinguish configuration failure from no events.
  if (!prisma) {
    return NextResponse.json(
      { events: [], error: "database_not_configured" },
      { status: 503, headers: RESPONSE_HEADERS }
    );
  }

  try {
    const now = new Date();
    // Recurring events may have an anchor in the past. Include recent anchors
    // and expand them to discover their next future occurrence.
    const cutoff = new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000);

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
    const events = nextOccurrences(occurrences).slice(0, limit).map(toPublicEvent);

    return NextResponse.json({ events }, { headers: RESPONSE_HEADERS });
  } catch (err) {
    logError("public_events.failed", { error: err.message });
    return NextResponse.json(
      { events: [], error: "event_query_failed" },
      { status: 500, headers: RESPONSE_HEADERS }
    );
  }
}
