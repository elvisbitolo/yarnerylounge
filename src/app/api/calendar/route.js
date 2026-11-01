import { getPrisma } from "@/lib/db/prisma";
import { listEvents } from "@/lib/server/events";
import { expandEvent } from "@/lib/server/events-core";

export async function GET() {
  const prisma = getPrisma();
  if (!prisma) {
    return new Response("Prisma not available", { status: 53 });
  }

  try {
    const events = await listEvents();
    const allEvents = [];
    for (const event of events) {
      const expanded = expandEvent(event);
      allEvents.push(...expanded);
    }

    const lines = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("PRODID:-//Christa's Speakeasy//Calendar//EN");
    lines.push("CALSCALE:GREGORIAN");
    lines.push("METHOD:PUBLISH");
    lines.push("X-WR-CALNAME:Christa's Speakeasy Lounge Events");
    lines.push("X-WR-DESCRIPTION:Live video lounge events and recurring blocks");
    lines.push("X-WR-TIMEZONE:Africa/Nairobi");

    const formatDate = (d) =>
      d.getFullYear() +
      "-" +
      ("0" + (d.getMonth() + 1)).slice(-2) +
      "-" +
      ("0" + d.getDate()).slice(-2) +
      "T" +
      ("0" + d.getHours()).slice(-2) +
      ":" +
      ("0" + d.getMinutes()).slice(-2);

    const seenIds = new Set();
    for (const event of allEvents) {
      if (!event.startTime) continue;

      const uid = event.id + "_" + (event.recurrence || "once");
      if (seenIds.has(uid)) continue;
      seenIds.add(uid);

      const start = new Date(event.startTime);
      const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 2 * 60 * 60 * 1000);

      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + event.id);
      lines.push("DTSTAMP:" + new Date().toISOString());
      lines.push("DTSTART:" + formatDate(start));
      lines.push("DTEND:" + formatDate(end));
      lines.push("SUMMARY:" + (event.title || "Live Lounge"));
      lines.push(
        "DESCRIPTION:" +
        (event.description || "Live video lounge") +
        "\nRSVP Count: " + (event.rsvpCount || 0) +
        "\nRoom: " + (event.roomSlug || "Lounge") +
        (event.purchasePriceCents > 0
          ? "\nPrice: " + (event.purchasePriceCents / 100) + (event.purchasePriceCents > 100 ? " annual" : " monthly")
          : "")
      );
      lines.push(
        "LOCATION:" + (event.roomName || "Lounge") + (event.roomSlug ? " (" + event.roomSlug + ")" : "")
      );
      lines.push(
        "URL:" + (process.env.NEXT_PUBLIC_APP_URL || "https://www.christasspeakeasy.com") + "/rooms/" + (event.roomSlug || "lounge")
      );

      if (event.recurrence) {
        lines.push("RRULE:FREQ=WEEKLY");
      }

      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    return new Response(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="speakeasy-calendar.ics"',
      },
    });
  } catch (err) {
    logError("calendar.feed_failed", { error: err.message });
    return new Response("Failed to generate calendar", { status: 500 });
  }
