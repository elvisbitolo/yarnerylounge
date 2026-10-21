import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { expandEvents } from "@/lib/server/events";
import {
  PUBLIC_EVENT_SELECT,
  nextOccurrences,
  parsePublicLimit,
  toPublicEvent,
} from "@/lib/server/public-events-core";

// Public calendar feed for the Shopify landing page (secretyarnery.com).
// Event titles, descriptions and times are intentionally public, including
// events marked members-only. Private room details are never returned.
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

    // Read event anchors before filtering occurrences. Filtering in SQL by
    // startTime excludes recurring events whose original anchor has passed;
    // the recurrence expander is responsible for determining their next date.
    // A bounded, newest-first read avoids the previous split queries and the
    // arbitrary 366-day cutoff while keeping the public request predictable.
    const rows = await prisma.event.findMany({
      orderBy: [{ startTime: "desc" }, { createdAt: "desc" }],
      take: 500,
      select: PUBLIC_EVENT_SELECT,
    });

    const upcoming = expandEvents(rows).filter(
      (event) => Number.isFinite(new Date(event.startTime).getTime()) &&
        new Date(event.startTime).getTime() >= now.getTime()
    );
    const events = nextOccurrences(upcoming)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
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
