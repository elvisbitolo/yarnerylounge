import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { expandEvents } from "@/lib/server/events";

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
  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 12)
    : 6;

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ events: [] }, { headers: CACHE_HEADERS });
  }

  try {
    // Recurring meetups (promoted availability blocks) keep a first-occurrence
    // anchor that can already be in the past, so a bare startTime >= now query
    // would hide every repeating event after its first run. Read anchors from
    // the last year, expand, then keep the future occurrences.
    const cutoff = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
    const rows = await prisma.event.findMany({
      where: { membersOnly: false, startTime: { gte: cutoff } },
      orderBy: { startTime: "asc" },
      take: 300,
    });
    const now = Date.now();
    const upcoming = expandEvents(rows)
      .filter((event) => new Date(event.startTime).getTime() >= now)
      .slice(0, limit);

    return NextResponse.json(
      {
        events: upcoming.map((event) => ({
          id: event.id,
          title: event.title || "Speakeasy event",
          description: (event.description || "").slice(0, 160),
          startTime: new Date(event.startTime).toISOString(),
          endTime: event.endTime ? new Date(event.endTime).toISOString() : null,
          roomSlug: event.roomSlug || "",
        })),
      },
      { headers: CACHE_HEADERS }
    );
  } catch (err) {
    logError("public_events.failed", { error: err.message });
    return NextResponse.json({ events: [] }, { headers: CACHE_HEADERS, status: 500 });
  }
}
